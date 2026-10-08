import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'

import { Failure } from './model'
import { SessionState } from './shared/session'

export const Message = defineMessageUnion({
  CompletedCreateSession: { sessionId: Schema.String, shareUrl: Schema.String },
  FailedCreateSession: { failure: Failure },
  ClickedNewSession: {},
  ClickedCopyLink: {},
  CompletedCopyLink: {},
  FailedCopyLink: {},
  ConnectedSession: { sessionId: Schema.String },
  DisconnectedSession: { sessionId: Schema.String },
  ReceivedSnapshot: { sessionId: Schema.String, snapshot: SessionState },
  ReceivedInvalidSnapshot: { sessionId: Schema.String },
  ClickedIncrement: {},
  ClickedReset: {},
  SucceededMutate: { sessionId: Schema.String, snapshot: SessionState },
  FailedMutate: { sessionId: Schema.String, failure: Failure },
})
export type Message = typeof Message.Type
