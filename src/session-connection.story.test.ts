import { Effect, Fiber, Stream } from 'effect'
import { describe, expect, test, vi } from 'vitest'

import type { Message } from './message'
import {
  type ConnectionBrowser,
  type Socket,
  sessionStream,
} from './session-connection'

type FakeSocket = Socket & {
  closed: number
  fireClose: () => void
  fireMessage: (data: string) => void
}

const socketAt = (sockets: Array<FakeSocket>, index: number): FakeSocket => {
  const socket = sockets[index]
  if (!socket) {
    throw new Error(`Missing socket ${index}`)
  }
  return socket
}

const setup = () => {
  const sockets: Array<FakeSocket> = []
  const listeners = {
    online: new Set<() => void>(),
    offline: new Set<() => void>(),
  }
  const messages: Array<Message> = []
  const environment: ConnectionBrowser = {
    online: () => true,
    open: () => {
      const socket: FakeSocket = {
        closed: 0,
        onmessage: null,
        onclose: null,
        onerror: null,
        close() {
          this.closed++
        },
        fireClose() {
          this.onclose?.(new CloseEvent('close'))
        },
        fireMessage(data) {
          this.onmessage?.(new MessageEvent('message', { data }))
        },
      }
      sockets.push(socket)
      return socket
    },
    addListener: (event, listener) => {
      listeners[event].add(listener)
    },
    removeListener: (event, listener) => {
      listeners[event].delete(listener)
    },
  }
  const fiber = Effect.runFork(
    Stream.runForEach(sessionStream('session', environment), message =>
      Effect.sync(() => {
        messages.push(message)
      }),
    ),
  )
  return { sockets, listeners, messages, fiber }
}

describe('session connection lifecycle', () => {
  test('malformed payload is separate from disconnect and a later attempt resyncs', async () => {
    const connection = setup()
    await vi.waitFor(() => expect(connection.sockets).toHaveLength(1))
    socketAt(connection.sockets, 0).fireMessage('not JSON')
    await vi.waitFor(() =>
      expect(
        connection.messages.some(
          message => message._tag === 'ReceivedInvalidSnapshot',
        ),
      ).toBe(true),
    )
    socketAt(connection.sockets, 0).fireClose()
    await vi.waitFor(() => expect(connection.sockets).toHaveLength(2), {
      timeout: 1000,
    })
    socketAt(connection.sockets, 1).fireMessage('{"count":2,"version":1}')
    await vi.waitFor(() =>
      expect(
        connection.messages.some(
          message => message._tag === 'ReceivedSnapshot',
        ),
      ).toBe(true),
    )
    await Effect.runPromise(Fiber.interrupt(connection.fiber))
  })

  test('disposal closes owned socket, removes listeners and ignores late events', async () => {
    const connection = setup()
    await vi.waitFor(() => expect(connection.sockets).toHaveLength(1))
    const oldSocket = socketAt(connection.sockets, 0)
    await Effect.runPromise(Fiber.interrupt(connection.fiber))
    expect(oldSocket.closed).toBeGreaterThan(0)
    expect(connection.listeners.online.size).toBe(0)
    expect(connection.listeners.offline.size).toBe(0)
    const messageCount = connection.messages.length
    oldSocket.fireMessage('{"count":1,"version":1}')
    oldSocket.fireClose()
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(connection.messages).toHaveLength(messageCount)
    expect(connection.sockets).toHaveLength(1)
  })

  test('retry uses initial delay and an old closed socket cannot close a newer socket', async () => {
    const connection = setup()
    await vi.waitFor(() => expect(connection.sockets).toHaveLength(1))
    const retiredMessage = socketAt(connection.sockets, 0).onmessage
    socketAt(connection.sockets, 0).fireClose()
    await vi.waitFor(() => expect(connection.sockets).toHaveLength(2), {
      timeout: 1000,
    })
    expect(connection.listeners.online.size).toBe(1)
    expect(connection.listeners.offline.size).toBe(1)
    const previousMessages = connection.messages.length
    retiredMessage?.(
      new MessageEvent('message', { data: '{"count":8,"version":9}' }),
    )
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(connection.messages).toHaveLength(previousMessages)
    const newer = socketAt(connection.sockets, 1)
    socketAt(connection.sockets, 0).fireMessage('bad')
    socketAt(connection.sockets, 0).fireClose()
    expect(newer.closed).toBe(0)
    await Effect.runPromise(Fiber.interrupt(connection.fiber))
  })
})
