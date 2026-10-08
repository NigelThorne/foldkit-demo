import { DurableObject } from 'cloudflare:workers'

import { MAX_WINS, type SessionState, isSessionId } from '../src/shared/session'

interface Env {
  SESSIONS: DurableObjectNamespace<WinSession>
  ASSETS: Fetcher
}

const json = (value: unknown, status = 200): Response =>
  Response.json(value, {
    status,
    headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' },
  })

const error = (status: number): Response =>
  json({ error: status === 404 ? 'Not found' : 'Invalid request' }, status)

const isSameOrigin = (request: Request, url: URL): boolean => {
  const origin = request.headers.get('Origin')
  return origin !== null && origin === url.origin
}

export class WinSession extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    this.ctx.storage.sql.exec(
      'CREATE TABLE IF NOT EXISTS session (id INTEGER PRIMARY KEY CHECK (id = 1), count INTEGER NOT NULL, version INTEGER NOT NULL)',
    )
    this.ctx.storage.sql.exec(
      'INSERT OR IGNORE INTO session (id, count, version) VALUES (1, 0, 0)',
    )
  }

  webSocketMessage(socket: WebSocket): void {
    socket.close(1008, 'Use the HTTP action endpoint')
  }

  webSocketClose(socket: WebSocket): void {
    socket.close(1000, 'Connection closed')
  }

  webSocketError(socket: WebSocket): void {
    socket.close(1011, 'Connection error')
  }

  private snapshot(): SessionState {
    const row = this.ctx.storage.sql
      .exec<SessionState>('SELECT count, version FROM session WHERE id = 1')
      .one()
    return { count: row.count, version: row.version }
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)
    if (request.method === 'GET' && url.pathname === '/snapshot') {
      if (request.headers.get('Upgrade')?.toLowerCase() === 'websocket') {
        // Bound retained sockets per object; further clients can still use HTTP snapshots.
        if (this.ctx.getWebSockets().length >= 32) {
          return error(429)
        }
        const pair = new WebSocketPair()
        this.ctx.acceptWebSocket(pair[1])
        try {
          pair[1].send(JSON.stringify(this.snapshot()))
        } catch {
          pair[1].close()
        }
        return new Response(null, { status: 101, webSocket: pair[0] })
      }
      return json(this.snapshot())
    }
    if (
      request.method !== 'POST' ||
      !['/increment', '/reset'].includes(url.pathname)
    ) {
      return error(404)
    }
    const action = url.pathname
    const state = this.ctx.storage.transactionSync(() => {
      this.ctx.storage.sql.exec(
        'UPDATE session SET count = ?, version = version + 1 WHERE id = 1',
        action === '/reset' ? 0 : Math.min(MAX_WINS, this.snapshot().count + 1),
      )
      return this.snapshot()
    })
    const message = JSON.stringify(state)
    for (const peer of this.ctx.getWebSockets()) {
      try {
        peer.send(message)
      } catch {
        try {
          peer.close()
        } catch {
          /* peer already closed */
        }
      }
    }
    return json(state)
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    if (!url.pathname.startsWith('/api/')) {
      const response = await env.ASSETS.fetch(request)
      const headers = new Headers(response.headers)
      headers.set('Referrer-Policy', 'no-referrer')
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      })
    }
    const match = /^\/api\/sessions\/([^/]+)(?:\/(increment|reset))?$/.exec(
      url.pathname,
    )
    const sessionId = match?.[1]
    if (!sessionId || !isSessionId(sessionId)) {
      return error(404)
    }
    const action = match[2]
    if (action ? request.method !== 'POST' : request.method !== 'GET') {
      return error(405)
    }
    const upgrade =
      request.headers.get('Upgrade')?.toLowerCase() === 'websocket'
    if (action || upgrade) {
      if (!isSameOrigin(request, url)) {
        return error(403)
      }
    }
    if (action) {
      if (
        !/^application\/json(?:\s*;|$)/i.test(
          request.headers.get('Content-Type') ?? '',
        )
      ) {
        return error(415)
      }
      if (Number(request.headers.get('Content-Length')) > 1024) {
        return error(413)
      }
      let body: string
      try {
        const reader = request.body?.getReader()
        if (!reader) {
          return error(400)
        }
        const chunks: Array<Uint8Array> = []
        let size = 0
        while (true) {
          const next = await reader.read()
          if (next.done) {
            break
          }
          size += next.value.byteLength
          if (size > 1024) {
            await reader.cancel()
            return error(413)
          }
          chunks.push(next.value)
        }
        const bytes = new Uint8Array(size)
        let offset = 0
        for (const chunk of chunks) {
          bytes.set(chunk, offset)
          offset += chunk.byteLength
        }
        body = new TextDecoder().decode(bytes)
        const parsed: unknown = JSON.parse(body)
        if (
          parsed === null ||
          Array.isArray(parsed) ||
          typeof parsed !== 'object' ||
          Object.keys(parsed).length !== 0
        ) {
          return error(400)
        }
      } catch {
        return error(400)
      }
    }
    const stub = env.SESSIONS.get(env.SESSIONS.idFromName(sessionId))
    return stub.fetch(
      new Request(new URL(action ? `/${action}` : '/snapshot', url), {
        method: request.method,
        headers: request.headers,
      }),
    )
  },
}
