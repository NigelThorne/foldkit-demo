import { Effect, Queue, Ref, Schedule, Schema, Stream } from 'effect'

import { Message } from './message'
import { SessionState } from './shared/session'

export type Socket = {
  close: () => void
  onmessage: ((event: MessageEvent) => void) | null
  onclose: ((event: CloseEvent) => void) | null
  onerror: ((event: Event) => void) | null
}
export type ConnectionBrowser = {
  readonly online: () => boolean
  readonly open: (sessionId: string) => Socket
  readonly addListener: (
    event: 'online' | 'offline',
    listener: () => void,
  ) => void
  readonly removeListener: (
    event: 'online' | 'offline',
    listener: () => void,
  ) => void
}

const browser: ConnectionBrowser = {
  online: () => navigator.onLine,
  open: sessionId => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    return new WebSocket(
      `${protocol}//${window.location.host}/api/sessions/${sessionId}`,
    )
  },
  addListener: (event, listener) => window.addEventListener(event, listener),
  removeListener: (event, listener) =>
    window.removeEventListener(event, listener),
}

export const sessionStream = (
  sessionId: string,
  environment: ConnectionBrowser = browser,
): Stream.Stream<Message> =>
  Stream.callback<Message>(queue =>
    Effect.gen(function* () {
      const backoff = yield* Ref.make(250)
      const emit = (message: Message) => {
        Queue.offerUnsafe(queue, message)
      }
      const waitForOnline = Effect.callback<void>(resume => {
        if (environment.online()) {
          resume(Effect.void)
          return Effect.void
        }
        const onOnline = () => {
          environment.removeListener('online', onOnline)
          resume(Effect.void)
        }
        environment.addListener('online', onOnline)
        return Effect.sync(() => environment.removeListener('online', onOnline))
      })
      const connect = Effect.callback<void>(resume => {
        let disposed = false
        let settled = false
        let socket: Socket
        try {
          socket = environment.open(sessionId)
        } catch {
          emit(Message.DisconnectedSession({ sessionId }))
          resume(Effect.void)
          return Effect.void
        }
        const dispose = () => {
          if (disposed) {
            return
          }
          disposed = true
          socket.onmessage = null
          socket.onclose = null
          socket.onerror = null
          environment.removeListener('offline', onOffline)
          environment.removeListener('online', onOnline)
          socket.close()
        }
        const finish = () => {
          if (!disposed && !settled) {
            settled = true
            dispose()
            emit(Message.DisconnectedSession({ sessionId }))
            resume(Effect.void)
          }
        }
        const onOffline = finish
        const onOnline = finish
        environment.addListener('offline', onOffline)
        environment.addListener('online', onOnline)
        socket.onmessage = event => {
          if (disposed) {
            return
          }
          try {
            const snapshot = Schema.decodeSync(SessionState)(
              JSON.parse(event.data),
            )
            emit(Message.ReceivedSnapshot({ sessionId, snapshot }))
            Effect.runSync(Ref.set(backoff, 250))
          } catch {
            emit(Message.ReceivedInvalidSnapshot({ sessionId }))
            finish()
          }
        }
        socket.onclose = finish
        socket.onerror = finish
        return Effect.sync(dispose)
      })
      yield* Effect.forkScoped(
        Effect.repeat(
          Effect.gen(function* () {
            yield* waitForOnline
            emit(Message.ConnectedSession({ sessionId }))
            yield* connect
            const delay = yield* Ref.get(backoff)
            yield* Effect.sleep(`${delay} millis`)
            yield* Ref.set(backoff, Math.min(delay * 2, 5000))
          }),
          Schedule.forever,
        ),
      )
    }),
  )
