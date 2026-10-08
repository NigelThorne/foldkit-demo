import { Effect, Option, Queue, Schema, Stream } from 'effect'
import { Command, Subscription, type Update } from 'foldkit'
import { Document, HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { modifyFields } from 'foldkit/struct'

import { MAX_WINS, SessionState, isSessionId } from './shared/session'

// MODEL
const Connection = Schema.Literals(['Connecting', 'Live', 'Offline'])
export const Model = Schema.Struct({
  sessionId: Schema.Option(Schema.String),
  invalidSession: Schema.Boolean,
  snapshot: Schema.Option(SessionState),
  connection: Connection,
  pending: Schema.Boolean,
  reconnectEpoch: Schema.Number,
  error: Schema.Option(Schema.String),
  copied: Schema.Boolean,
  shareUrl: Schema.String,
})
export type Model = typeof Model.Type

// MESSAGE
export const Message = defineMessageUnion({
  CompletedCreateSession: { sessionId: Schema.String, shareUrl: Schema.String },
  FailedCreateSession: {},
  ClickedNewSession: {},
  ClickedCopyLink: {},
  CompletedCopyLink: {},
  FailedCopyLink: {},
  ConnectedSession: { sessionId: Schema.String },
  DisconnectedSession: { sessionId: Schema.String },
  ReceivedSnapshot: { sessionId: Schema.String, snapshot: SessionState },
  ClickedIncrement: {},
  ClickedReset: {},
  SucceededMutate: { sessionId: Schema.String, snapshot: SessionState },
  FailedMutate: { sessionId: Schema.String },
})
export type Message = typeof Message.Type

// COMMAND
const CreateSession = Command.define('CreateSession', {
  messages: [Message.CompletedCreateSession, Message.FailedCreateSession],
  execute: Effect.try({
    try: () => {
      const sessionId = crypto.randomUUID()
      const url = new URL(window.location.href)
      url.searchParams.set('session', sessionId)
      window.history.replaceState(null, '', url)
      return Message.CompletedCreateSession({ sessionId, shareUrl: url.href })
    },
    catch: () => undefined,
  }).pipe(Effect.catch(() => Effect.succeed(Message.FailedCreateSession()))),
})
export const OpenNewSession = Command.define('OpenNewSession', {
  messages: [Message.CompletedCreateSession, Message.FailedCreateSession],
  execute: Effect.try({
    try: () => {
      const sessionId = crypto.randomUUID()
      const url = new URL(window.location.href)
      url.searchParams.set('session', sessionId)
      window.location.assign(url.href)
      return Message.CompletedCreateSession({ sessionId, shareUrl: url.href })
    },
    catch: () => undefined,
  }).pipe(Effect.catch(() => Effect.succeed(Message.FailedCreateSession()))),
})
export const CopyLink = Command.define('CopyLink', {
  args: { shareUrl: Schema.String },
  messages: [Message.CompletedCopyLink, Message.FailedCopyLink],
  execute: ({ shareUrl }) =>
    Effect.tryPromise({
      try: () => navigator.clipboard.writeText(shareUrl),
      catch: () => undefined,
    }).pipe(
      Effect.map(() => Message.CompletedCopyLink()),
      Effect.catch(() => Effect.succeed(Message.FailedCopyLink())),
    ),
})
export const Mutate = Command.define('Mutate', {
  args: {
    sessionId: Schema.String,
    action: Schema.Literals(['increment', 'reset']),
  },
  messages: [Message.SucceededMutate, Message.FailedMutate],
  execute: ({ sessionId, action }) =>
    Effect.tryPromise({
      try: async signal => {
        const response = await fetch(`/api/sessions/${sessionId}/${action}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{}',
          signal: AbortSignal.any([signal, AbortSignal.timeout(10000)]),
        })
        if (!response.ok) {
          throw new Error('Action not confirmed')
        }
        const snapshot = Schema.decodeSync(SessionState)(await response.json())
        return Message.SucceededMutate({ sessionId, snapshot })
      },
      catch: () => undefined,
    }).pipe(
      Effect.catch(() => Effect.succeed(Message.FailedMutate({ sessionId }))),
    ),
})

// INIT
export const init = (href: string) => {
  const url = new URL(href)
  const sessionId = url.searchParams.get('session')
  const valid = sessionId !== null && isSessionId(sessionId)
  const model: Model = {
    sessionId: valid ? Option.some(sessionId) : Option.none(),
    invalidSession: sessionId !== null && !valid,
    snapshot: Option.none(),
    connection: 'Connecting',
    pending: false,
    reconnectEpoch: 0,
    error: Option.none(),
    copied: false,
    shareUrl: valid ? url.href : '',
  }
  return sessionId === null ? { model, commands: [CreateSession()] } : { model }
}

// UPDATE
const matches = (model: Model, sessionId: string) =>
  Option.isSome(model.sessionId) && model.sessionId.value === sessionId
const canMutate = (model: Model) =>
  model.connection === 'Live' && Option.isSome(model.snapshot) && !model.pending
const applySnapshot = (model: Model, snapshot: SessionState) =>
  Option.isNone(model.snapshot) ||
  snapshot.version >= model.snapshot.value.version
    ? modifyFields(model, { snapshot: () => Option.some(snapshot) })
    : model

export const update = (model: Model, message: Message) =>
  Message.match<Update.Return<Model, Message>>(message, {
    CompletedCreateSession: ({ sessionId, shareUrl }) => ({
      model: modifyFields(model, {
        sessionId: () => Option.some(sessionId),
        invalidSession: () => false,
        shareUrl: () => shareUrl,
        snapshot: () => Option.none(),
        connection: () => 'Connecting' as const,
        error: () => Option.none(),
        pending: () => false,
      }),
    }),
    FailedCreateSession: () => ({
      model: modifyFields(model, {
        error: () => Option.some('Could not create a session. Try again.'),
      }),
    }),
    ClickedNewSession: () => ({ model, commands: [OpenNewSession()] }),
    ClickedCopyLink: () => ({
      model,
      commands: model.shareUrl ? [CopyLink({ shareUrl: model.shareUrl })] : [],
    }),
    CompletedCopyLink: () => ({
      model: modifyFields(model, { copied: () => true }),
    }),
    FailedCopyLink: () => ({
      model: modifyFields(model, {
        error: () =>
          Option.some('Copy failed. Select the link below to share it.'),
      }),
    }),
    ConnectedSession: ({ sessionId }) => ({
      model: matches(model, sessionId)
        ? modifyFields(model, { connection: () => 'Connecting' as const })
        : model,
    }),
    DisconnectedSession: ({ sessionId }) => ({
      model: matches(model, sessionId)
        ? modifyFields(model, { connection: () => 'Offline' as const })
        : model,
    }),
    ReceivedSnapshot: ({ sessionId, snapshot }) => ({
      model: matches(model, sessionId)
        ? modifyFields(applySnapshot(model, snapshot), {
            connection: () => 'Live' as const,
            error: () => Option.none(),
          })
        : model,
    }),
    ClickedIncrement: () => ({
      model:
        canMutate(model) &&
        Option.isSome(model.sessionId) &&
        Option.isSome(model.snapshot) &&
        model.snapshot.value.count < MAX_WINS
          ? modifyFields(model, { pending: () => true })
          : model,
      commands:
        canMutate(model) &&
        Option.isSome(model.sessionId) &&
        Option.isSome(model.snapshot) &&
        model.snapshot.value.count < MAX_WINS
          ? [Mutate({ sessionId: model.sessionId.value, action: 'increment' })]
          : [],
    }),
    ClickedReset: () => ({
      model:
        canMutate(model) &&
        Option.isSome(model.sessionId) &&
        Option.isSome(model.snapshot) &&
        model.snapshot.value.count > 0
          ? modifyFields(model, { pending: () => true })
          : model,
      commands:
        canMutate(model) &&
        Option.isSome(model.sessionId) &&
        Option.isSome(model.snapshot) &&
        model.snapshot.value.count > 0
          ? [Mutate({ sessionId: model.sessionId.value, action: 'reset' })]
          : [],
    }),
    SucceededMutate: ({ sessionId, snapshot }) => ({
      model: matches(model, sessionId)
        ? modifyFields(applySnapshot(model, snapshot), { pending: () => false })
        : model,
    }),
    FailedMutate: ({ sessionId }) => ({
      model: matches(model, sessionId)
        ? modifyFields(model, {
            pending: () => false,
            reconnectEpoch: epoch => epoch + 1,
            connection: () => 'Offline' as const,
            error: () =>
              Option.some(
                'Action not confirmed. Reconnecting to check the current count; please do not retry yet.',
              ),
          })
        : model,
    }),
  })

// SUBSCRIPTION
export const subscriptions = Subscription.make<Model, Message>()(entry => ({
  session: entry(
    { sessionId: Schema.Option(Schema.String), reconnectEpoch: Schema.Number },
    {
      modelToDependencies: model => ({
        sessionId: model.sessionId,
        reconnectEpoch: model.reconnectEpoch,
      }),
      dependenciesToStream: ({ sessionId }) =>
        Option.isSome(sessionId)
          ? sessionStream(sessionId.value)
          : Stream.empty,
    },
  ),
}))

const sessionStream = (sessionId: string): Stream.Stream<Message> =>
  Stream.callback<Message>(queue =>
    Effect.gen(function* () {
      let active = true
      let socket: WebSocket | undefined
      const onOffline = () => {
        socket?.close()
        void Effect.runPromise(
          Queue.offer(queue, Message.DisconnectedSession({ sessionId })),
        )
      }
      const onOnline = () => socket?.close()
      window.addEventListener('offline', onOffline)
      window.addEventListener('online', onOnline)
      yield* Effect.addFinalizer(() =>
        Effect.sync(() => {
          active = false
          socket?.close()
          window.removeEventListener('offline', onOffline)
          window.removeEventListener('online', onOnline)
        }),
      )
      yield* Effect.forkScoped(
        Effect.gen(function* () {
          let delay = 250
          while (active) {
            if (!navigator.onLine) {
              yield* Queue.offer(
                queue,
                Message.DisconnectedSession({ sessionId }),
              )
              yield* Effect.sleep('500 millis')
              continue
            }
            yield* Queue.offer(queue, Message.ConnectedSession({ sessionId }))
            yield* Effect.callback<void>(resume => {
              const protocol =
                window.location.protocol === 'https:' ? 'wss:' : 'ws:'
              socket = new WebSocket(
                `${protocol}//${window.location.host}/api/sessions/${sessionId}`,
              )
              socket.onmessage = event => {
                try {
                  const snapshot = Schema.decodeSync(SessionState)(
                    JSON.parse(event.data),
                  )
                  void Effect.runPromise(
                    Queue.offer(
                      queue,
                      Message.ReceivedSnapshot({ sessionId, snapshot }),
                    ),
                  )
                  delay = 250
                } catch {
                  socket?.close()
                }
              }
              socket.onclose = () => resume(Effect.void)
              socket.onerror = () => socket?.close()
              return Effect.sync(() => socket?.close())
            })
            if (active) {
              yield* Queue.offer(
                queue,
                Message.DisconnectedSession({ sessionId }),
              )
              yield* Effect.sleep(`${delay} millis`)
              delay = Math.min(delay * 2, 5000)
            }
          }
        }),
      )
    }),
  )

// VIEW
export const view = (model: Model, h: HtmlBuilder<Message>): Document => {
  const count = Option.isSome(model.snapshot) ? model.snapshot.value.count : 0
  return {
    title: `Little wins · ${count} of ${MAX_WINS}`,
    body: h.main(
      [h.Class('page')],
      [
        h.div([h.Class('ambient ambient-one'), h.AriaHidden(true)]),
        h.div([h.Class('ambient ambient-two'), h.AriaHidden(true)]),
        h.section(
          [h.Class('card'), h.AriaLabel('Little wins tracker')],
          [
            h.header(
              [h.Class('intro')],
              [
                h.p([h.Class('eyebrow')], ['A moment for the good stuff']),
                h.h1([], ['Little wins']),
                h.p(
                  [h.Class('lede')],
                  ['Small steps count. Give each one its place.'],
                ),
              ],
            ),
            model.invalidSession
              ? h.div(
                  [],
                  [
                    h.p([h.Role('alert')], ['This session link is invalid.']),
                    h.button(
                      [
                        h.Class('button button-primary'),
                        h.OnClick(Message.ClickedNewSession()),
                      ],
                      ['New session'],
                    ),
                  ],
                )
              : h.div(
                  [],
                  [
                    h.p(
                      [h.Class('connection'), h.AriaLive('polite')],
                      [model.connection],
                    ),
                    h.div(
                      [h.Class('count-wrap')],
                      [
                        h.p(
                          [h.Class('count')],
                          [Option.isSome(model.snapshot) ? String(count) : '—'],
                        ),
                        h.p(
                          [h.Class('count-caption')],
                          [`of ${MAX_WINS} wins`],
                        ),
                      ],
                    ),
                    h.div(
                      [
                        h.Class('progress'),
                        h.Role('progressbar'),
                        h.AriaLabel('Wins this round'),
                        h.AriaValuemin(0),
                        h.AriaValuemax(MAX_WINS),
                        h.AriaValuenow(count),
                      ],
                      Array.from({ length: MAX_WINS }, (_, index) =>
                        h.span([
                          h.Class(index < count ? 'dot dot-filled' : 'dot'),
                          h.AriaHidden(true),
                        ]),
                      ),
                    ),
                    h.p(
                      [h.Class('status'), h.AriaLive('polite')],
                      [
                        count === MAX_WINS
                          ? 'Ten little wins. Nicely done.'
                          : count === 0
                            ? 'Your next win starts here.'
                            : `${count} of ${MAX_WINS} wins. Keep going.`,
                      ],
                    ),
                    h.div(
                      [h.Class('actions')],
                      [
                        h.button(
                          [
                            h.Class('button button-primary'),
                            h.OnClick(Message.ClickedIncrement()),
                            h.Disabled(!canMutate(model) || count === MAX_WINS),
                          ],
                          ['Add a win'],
                        ),
                        h.button(
                          [
                            h.Class('button button-secondary'),
                            h.OnClick(Message.ClickedReset()),
                            h.Disabled(!canMutate(model) || count === 0),
                          ],
                          ['Start again'],
                        ),
                      ],
                    ),
                    Option.isSome(model.error)
                      ? h.p([h.Role('alert')], [model.error.value])
                      : h.empty,
                    h.div(
                      [h.Class('share')],
                      [
                        h.p(
                          [],
                          ['Anyone with this link can add or reset wins.'],
                        ),
                        h.button(
                          [
                            h.Class('button button-secondary'),
                            h.OnClick(Message.ClickedCopyLink()),
                            h.Disabled(!model.shareUrl),
                          ],
                          [model.copied ? 'Copied!' : 'Copy link'],
                        ),
                        h.p([h.Class('share-url')], [model.shareUrl]),
                        h.button(
                          [
                            h.Class('button button-secondary'),
                            h.OnClick(Message.ClickedNewSession()),
                          ],
                          ['New session'],
                        ),
                      ],
                    ),
                  ],
                ),
          ],
        ),
        h.footer(
          [h.Class('footer')],
          ['Built with Foldkit · TypeScript + Effect'],
        ),
      ],
    ),
  }
}
