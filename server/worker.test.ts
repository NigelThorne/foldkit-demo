import { build } from 'esbuild'
import { Miniflare } from 'miniflare'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, test } from 'vitest'

const first = 'a4f38e12-5513-4fb2-8acd-13cc4df4181f'
const second = 'b5f38e12-5513-4fb2-8acd-13cc4df4181f'
const origin = 'https://example.test'
let instances: Array<Miniflare> = []
let directories: Array<string> = []

afterEach(async () => {
  await Promise.all(instances.map(instance => instance.dispose()))
  await Promise.all(
    directories.map(directory =>
      rm(directory, { recursive: true, force: true }),
    ),
  )
  instances = []
  directories = []
})

const create = async (directory?: string): Promise<Miniflare> => {
  const persistence = directory ?? (await mkdtemp(join(tmpdir(), 'wins-test-')))
  if (!directory) {
    directories.push(persistence)
  }
  const bundle = await build({
    entryPoints: ['server/worker.ts'],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    write: false,
    external: ['cloudflare:workers'],
  })
  const mf = new Miniflare({
    modules: [
      {
        type: 'ESModule',
        path: 'worker.mjs',
        contents: bundle.outputFiles[0].text,
      },
    ],
    durableObjects: { SESSIONS: { className: 'WinSession', useSQLite: true } },
    durableObjectsPersist: persistence,
    serviceBindings: { ASSETS: async () => new Response('static') },
  })
  instances.push(mf)
  return mf
}

const request = (
  mf: Miniflare,
  id: string,
  action = '',
  init: RequestInit = {},
) => mf.dispatchFetch(`${origin}/api/sessions/${id}${action}`, init)
const post = (mf: Miniflare, id: string, action: string, body = '{}') =>
  request(mf, id, `/${action}`, {
    method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json' },
    body,
  })

const nextMessage = (socket: WebSocket): Promise<unknown> =>
  new Promise(resolve => {
    socket.addEventListener(
      'message',
      event => resolve(JSON.parse(String(event.data))),
      { once: true },
    )
  })

test('two sockets receive snapshots and committed updates, including reset', async () => {
  const mf = await create()
  const open = async () => {
    const response = await request(mf, first, '', {
      headers: { Origin: origin, Upgrade: 'websocket' },
    })
    expect(response.status).toBe(101)
    const socket = response.webSocket!
    const initial = nextMessage(socket)
    socket.accept()
    expect(await initial).toEqual({ count: 0, version: 0 })
    return socket
  }
  const a = await open()
  const b = await open()
  const aUpdate = nextMessage(a)
  const bUpdate = nextMessage(b)
  const result = await post(mf, first, 'increment')
  expect(await result.text()).toBe('{"count":1,"version":1}')
  expect(await aUpdate).toEqual({ count: 1, version: 1 })
  expect(await bUpdate).toEqual({ count: 1, version: 1 })
  const reset = nextMessage(a)
  await post(mf, first, 'reset')
  expect(await reset).toEqual({ count: 0, version: 2 })
  a.close()
  b.close()
})

test('atomic increments cap at ten and isolate sessions', async () => {
  const mf = await create()
  const initialResponses = await Promise.all(
    Array.from({ length: 6 }, () => post(mf, first, 'increment')),
  )
  const initialStates = await Promise.all(
    initialResponses.map(response => response.json()),
  )
  expect(initialStates.map(state => state.count).sort()).toEqual([
    1, 2, 3, 4, 5, 6,
  ])
  expect(await (await request(mf, first)).json()).toEqual({
    count: 6,
    version: 6,
  })
  const responses = await Promise.all(
    Array.from({ length: 15 }, () => post(mf, first, 'increment')),
  )
  expect(responses.every(response => response.status === 200)).toBe(true)
  expect(await (await request(mf, first)).json()).toEqual({
    count: 10,
    version: 21,
  })
  expect(await (await request(mf, second)).json()).toEqual({
    count: 0,
    version: 0,
  })
})

test('rejects invalid IDs, origins, methods, and bodies without writes', async () => {
  const mf = await create()
  expect((await request(mf, 'INVALID')).status).toBe(404)
  expect((await request(mf, first, '/reset')).status).toBe(405)
  expect(
    (
      await request(mf, first, '', {
        headers: { Origin: 'https://evil.test', Upgrade: 'websocket' },
      })
    ).status,
  ).toBe(403)
  expect(
    (
      await request(mf, first, '/reset', {
        method: 'POST',
        headers: {
          Origin: 'https://evil.test',
          'Content-Type': 'application/json',
        },
        body: '{}',
      })
    ).status,
  ).toBe(403)
  expect((await post(mf, first, 'increment', '{')).status).toBe(400)
  expect(
    (await post(mf, first, 'increment', JSON.stringify({ extra: true })))
      .status,
  ).toBe(400)
  expect((await post(mf, first, 'increment', ' '.repeat(1025))).status).toBe(
    413,
  )
  expect(await (await request(mf, first)).json()).toEqual({
    count: 0,
    version: 0,
  })
})

test('WebSockets are receive-only and reject mutation frames', async () => {
  const mf = await create()
  const response = await request(mf, first, '', {
    headers: { Origin: origin, Upgrade: 'websocket' },
  })
  const socket = response.webSocket!
  const initial = nextMessage(socket)
  socket.accept()
  await initial
  const closed = new Promise<number>(resolve => {
    socket.addEventListener('close', event => resolve(event.code), {
      once: true,
    })
  })
  socket.send(JSON.stringify({ action: 'increment' }))
  expect(await closed).toBe(1008)
  expect(await (await request(mf, first)).json()).toEqual({
    count: 0,
    version: 0,
  })
})

test('persists across Miniflare restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'wins-persist-'))
  directories.push(directory)
  const firstRuntime = await create(directory)
  await post(firstRuntime, first, 'increment')
  await firstRuntime.dispose()
  instances = []
  const restarted = await create(directory)
  expect(await (await request(restarted, first)).json()).toEqual({
    count: 1,
    version: 1,
  })
})
