import { Option, Schema } from 'effect'
import { defineTaggedUnion } from 'foldkit/schema'

import { SessionState } from './shared/session'

export const Failure = defineTaggedUnion({
  Network: {},
  Timeout: {},
  Http: { status: Schema.Number },
  InvalidResponse: {},
})
export type Failure = typeof Failure.Type

export const Connection = defineTaggedUnion({
  Connecting: { maybeSnapshot: Schema.Option(SessionState) },
  Live: { snapshot: SessionState },
  Offline: { maybeSnapshot: Schema.Option(SessionState) },
})
export type Connection = typeof Connection.Type

export const Mutation = defineTaggedUnion({ Idle: {}, Pending: {} })
export type Mutation = typeof Mutation.Type

export const Copy = defineTaggedUnion({ Ready: {}, Copied: {}, Failed: {} })
export type Copy = typeof Copy.Type

export const Session = defineTaggedUnion({
  Creating: { maybeFailure: Schema.Option(Failure) },
  Invalid: {},
  Active: {
    sessionId: Schema.String,
    shareUrl: Schema.String,
    connection: Connection,
    mutation: Mutation,
    copy: Copy,
    maybeConnectionFailure: Schema.Option(Failure),
    maybeMutationFailure: Schema.Option(Failure),
    reconnectEpoch: Schema.Number,
  },
})
export type Session = typeof Session.Type

export const Model = Schema.Struct({ session: Session })
export type Model = typeof Model.Type

export const activeSession = (sessionId: string, shareUrl: string): Session =>
  Session.Active({
    sessionId,
    shareUrl,
    connection: Connection.Connecting({ maybeSnapshot: Option.none() }),
    mutation: Mutation.Idle(),
    copy: Copy.Ready(),
    maybeConnectionFailure: Option.none(),
    maybeMutationFailure: Option.none(),
    reconnectEpoch: 0,
  })

export const maybeSnapshot = (
  connection: Connection,
): Option.Option<SessionState> =>
  Connection.match(connection, {
    Connecting: ({ maybeSnapshot }) => maybeSnapshot,
    Live: ({ snapshot }) => Option.some(snapshot),
    Offline: ({ maybeSnapshot }) => maybeSnapshot,
  })

export const failureText = (failure: Failure): string =>
  Failure.match(failure, {
    Network: () =>
      'The update could not be confirmed because the network request failed.',
    Timeout: () =>
      'The update could not be confirmed before the request timed out.',
    Http: ({ status }) =>
      status === 429
        ? 'The server rejected the update because it received too many requests.'
        : `The server returned ${status} instead of confirming the update.`,
    InvalidResponse: () => 'The server response could not be understood.',
  })
