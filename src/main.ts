import { Effect, Option, Schema, Stream } from 'effect'
import { Command, Subscription, type Update } from 'foldkit'
import { modifyFields } from 'foldkit/struct'

import { Message } from './message'
import {
  Connection,
  Copy,
  Failure,
  Model,
  Mutation,
  Session,
  activeSession,
  maybeSnapshot,
} from './model'
import { sessionStream } from './session-connection'
import { MAX_WINS, SessionState, isSessionId } from './shared/session'
import { view } from './view'

export { Message, Model, view }

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
    catch: () => Failure.Network(),
  }).pipe(
    Effect.catch(failure =>
      Effect.succeed(Message.FailedCreateSession({ failure })),
    ),
  ),
})
export const OpenNewSession = Command.define('OpenNewSession', {
  messages: [Message.FailedCreateSession],
  execute: Effect.try({
    try: () => {
      const sessionId = crypto.randomUUID()
      const url = new URL(window.location.href)
      url.searchParams.set('session', sessionId)
      window.location.assign(url.href)
    },
    catch: () => Failure.Network(),
  }).pipe(
    Effect.flatMap(() => Effect.never),
    Effect.catch(failure =>
      Effect.succeed(Message.FailedCreateSession({ failure })),
    ),
  ),
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

const requestFailure = (error: unknown): Failure => {
  if (error instanceof DOMException && error.name === 'TimeoutError') {
    return Failure.Timeout()
  }
  if (error instanceof Error && error.name === 'TimeoutError') {
    return Failure.Timeout()
  }
  return Failure.Network()
}

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
          return Message.FailedMutate({
            sessionId,
            failure: Failure.Http({ status: response.status }),
          })
        }
        let payload: unknown
        try {
          payload = await response.json()
          return Message.SucceededMutate({
            sessionId,
            snapshot: Schema.decodeUnknownSync(SessionState)(payload),
          })
        } catch {
          return Message.FailedMutate({
            sessionId,
            failure: Failure.InvalidResponse(),
          })
        }
      },
      catch: requestFailure,
    }).pipe(
      Effect.catch(failure =>
        Effect.succeed(Message.FailedMutate({ sessionId, failure })),
      ),
    ),
})

// INIT
export const init = (href: string) => {
  const url = new URL(href)
  const sessionId = url.searchParams.get('session')
  const model: Model = {
    session:
      sessionId === null
        ? Session.Creating({ maybeFailure: Option.none() })
        : isSessionId(sessionId)
          ? activeSession(sessionId, url.href)
          : Session.Invalid(),
  }
  return sessionId === null ? { model, commands: [CreateSession()] } : { model }
}

// UPDATE
const updateActive = (
  model: Model,
  sessionId: string,
  updateSession: (session: Extract<Session, { _tag: 'Active' }>) => Session,
): Model => {
  const session = model.session
  return session._tag === 'Active' && session.sessionId === sessionId
    ? modifyFields(model, { session: () => updateSession(session) })
    : model
}

const newestSnapshot = (connection: Connection, snapshot: SessionState) => {
  const previous = maybeSnapshot(connection)
  return Option.isNone(previous) || snapshot.version >= previous.value.version
    ? snapshot
    : previous.value
}

const applySnapshot = (
  connection: Connection,
  snapshot: SessionState,
): Connection => {
  const latest = newestSnapshot(connection, snapshot)
  return Connection.match(connection, {
    Connecting: () =>
      Connection.Connecting({ maybeSnapshot: Option.some(latest) }),
    Offline: () => Connection.Offline({ maybeSnapshot: Option.some(latest) }),
    Live: () => Connection.Live({ snapshot: latest }),
  })
}

const startMutation = (
  model: Model,
  action: 'increment' | 'reset',
): Update.Return<Model, Message> => {
  const session = model.session
  if (
    session._tag !== 'Active' ||
    session.connection._tag !== 'Live' ||
    session.mutation._tag !== 'Idle'
  ) {
    return { model }
  }
  const count = session.connection.snapshot.count
  if (action === 'increment' ? count >= MAX_WINS : count === 0) {
    return { model }
  }
  return {
    model: modifyFields(model, {
      session: () =>
        modifyFields(session, { mutation: () => Mutation.Pending() }),
    }),
    commands: [Mutate({ sessionId: session.sessionId, action })],
  }
}

export const update = (model: Model, message: Message) =>
  Message.match<Update.Return<Model, Message>>(message, {
    CompletedCreateSession: ({ sessionId, shareUrl }) => ({
      model:
        model.session._tag === 'Creating'
          ? modifyFields(model, {
              session: () => activeSession(sessionId, shareUrl),
            })
          : model,
    }),
    FailedCreateSession: ({ failure }) => ({
      model:
        model.session._tag === 'Creating'
          ? modifyFields(model, {
              session: () =>
                Session.Creating({ maybeFailure: Option.some(failure) }),
            })
          : model,
    }),
    ClickedNewSession: () => ({ model, commands: [OpenNewSession()] }),
    ClickedCopyLink: () =>
      model.session._tag === 'Active'
        ? {
            model,
            commands: [CopyLink({ shareUrl: model.session.shareUrl })],
          }
        : { model },
    CompletedCopyLink: () => ({
      model: modifyFields(model, {
        session: session =>
          session._tag === 'Active'
            ? modifyFields(session, { copy: () => Copy.Copied() })
            : session,
      }),
    }),
    FailedCopyLink: () => ({
      model: modifyFields(model, {
        session: session =>
          session._tag === 'Active'
            ? modifyFields(session, { copy: () => Copy.Failed() })
            : session,
      }),
    }),
    ConnectedSession: ({ sessionId }) => ({
      model: updateActive(model, sessionId, session =>
        modifyFields(session, {
          connection: connection =>
            Connection.Connecting({ maybeSnapshot: maybeSnapshot(connection) }),
        }),
      ),
    }),
    DisconnectedSession: ({ sessionId }) => ({
      model: updateActive(model, sessionId, session =>
        modifyFields(session, {
          connection: connection =>
            Connection.Offline({ maybeSnapshot: maybeSnapshot(connection) }),
        }),
      ),
    }),
    ReceivedSnapshot: ({ sessionId, snapshot }) => ({
      model: updateActive(model, sessionId, session =>
        modifyFields(session, {
          connection: connection =>
            Connection.Live({ snapshot: newestSnapshot(connection, snapshot) }),
          maybeConnectionFailure: () => Option.none(),
        }),
      ),
    }),
    ReceivedInvalidSnapshot: ({ sessionId }) => ({
      model: updateActive(model, sessionId, session =>
        modifyFields(session, {
          maybeConnectionFailure: () => Option.some(Failure.InvalidResponse()),
        }),
      ),
    }),
    ClickedIncrement: () => startMutation(model, 'increment'),
    ClickedReset: () => startMutation(model, 'reset'),
    SucceededMutate: ({ sessionId, snapshot }) => ({
      model: updateActive(model, sessionId, session =>
        modifyFields(session, {
          connection: connection => applySnapshot(connection, snapshot),
          mutation: () => Mutation.Idle(),
          maybeMutationFailure: () => Option.none(),
        }),
      ),
    }),
    FailedMutate: ({ sessionId, failure }) => ({
      model: updateActive(model, sessionId, session =>
        modifyFields(session, {
          mutation: () => Mutation.Idle(),
          reconnectEpoch: epoch => epoch + 1,
          connection: connection =>
            Connection.Offline({ maybeSnapshot: maybeSnapshot(connection) }),
          maybeMutationFailure: () => Option.some(failure),
        }),
      ),
    }),
  })

// SUBSCRIPTION
export const subscriptions = Subscription.make<Model, Message>()(entry => ({
  session: entry(
    { sessionId: Schema.Option(Schema.String), reconnectEpoch: Schema.Number },
    {
      modelToDependencies: model =>
        Session.match(model.session, {
          Creating: () => ({
            sessionId: Option.none(),
            reconnectEpoch: 0,
          }),
          Invalid: () => ({ sessionId: Option.none(), reconnectEpoch: 0 }),
          Active: ({ sessionId, reconnectEpoch }) => ({
            sessionId: Option.some(sessionId),
            reconnectEpoch,
          }),
        }),
      dependenciesToStream: ({ sessionId }) =>
        Option.isSome(sessionId)
          ? sessionStream(sessionId.value)
          : Stream.empty,
    },
  ),
}))
