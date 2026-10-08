import { Option } from 'effect'
import { Command, given, message, model, story } from 'foldkit/story'
import { describe, expect, test } from 'vitest'

import {
  CopyLink,
  Message,
  type Model,
  Mutate,
  OpenNewSession,
  init,
  update,
} from './main'
import {
  Connection,
  Failure,
  Mutation,
  Session,
  activeSession,
  maybeSnapshot,
} from './model'

const id = '12345678-1234-4123-8123-123456789abc'
const other = '12345678-1234-4123-8123-123456789abd'
const ready = (count = 0, version = 0): Model => ({
  session: Session.Active({
    ...active({
      session: activeSession(id, `https://example.com/?session=${id}`),
    }),
    connection: Connection.Live({ snapshot: { count, version } }),
  }),
})
const active = (model: Model) => {
  expect(model.session._tag).toBe('Active')
  if (model.session._tag !== 'Active') {
    throw new Error('Expected active session')
  }
  return model.session
}

describe('shared wins', () => {
  test('initializes from an explicit URL without browser globals', () => {
    expect(
      active(init(`https://example.com/?session=${id}`).model).sessionId,
    ).toBe(id)
    expect(
      init('https://example.com/?session=invalid').model.session._tag,
    ).toBe('Invalid')
    expect(init('https://example.com/').commands).toHaveLength(1)
  })

  test('requests increment without optimistic count', () => {
    story(
      update,
      given(ready()),
      message(Message.ClickedIncrement()),
      Command.expectExact(Mutate),
      model(m => {
        expect(active(m).mutation._tag).toBe('Pending')
        expect(
          Option.getOrThrow(maybeSnapshot(active(m).connection)).count,
        ).toBe(0)
      }),
      Command.resolve(
        Mutate,
        Message.SucceededMutate({
          sessionId: id,
          snapshot: { count: 1, version: 1 },
        }),
      ),
    )
  })

  test('requires live snapshot and ignores repeated clicks', () => {
    const base = active(ready())
    story(
      update,
      given({
        session: Session.Active({
          ...base,
          connection: Connection.Offline({
            maybeSnapshot: Option.some({ count: 0, version: 0 }),
          }),
        }),
      }),
      message(Message.ClickedIncrement()),
      Command.expectNone(),
    )
    story(
      update,
      given({
        session: Session.Active({
          ...base,
          connection: Connection.Connecting({ maybeSnapshot: Option.none() }),
        }),
      }),
      message(Message.ClickedIncrement()),
      Command.expectNone(),
    )
    story(
      update,
      given({
        session: Session.Active({ ...base, mutation: Mutation.Pending() }),
      }),
      message(Message.ClickedIncrement()),
      Command.expectNone(),
    )
  })

  test('server snapshots are authoritative and version ordered', () => {
    story(
      update,
      given(ready(2, 3)),
      message(
        Message.ReceivedSnapshot({
          sessionId: id,
          snapshot: { count: 4, version: 5 },
        }),
      ),
      message(
        Message.SucceededMutate({
          sessionId: id,
          snapshot: { count: 3, version: 4 },
        }),
      ),
      message(
        Message.ReceivedSnapshot({
          sessionId: other,
          snapshot: { count: 10, version: 20 },
        }),
      ),
      model(m =>
        expect(Option.getOrThrow(maybeSnapshot(active(m).connection))).toEqual({
          count: 4,
          version: 5,
        }),
      ),
    )
  })

  test('pending request survives disconnect and reconnect until HTTP settles', () => {
    const pending = update(ready(2, 3), Message.ClickedIncrement()).model
    const offline = update(
      pending,
      Message.DisconnectedSession({ sessionId: id }),
    ).model
    const reconnecting = update(
      offline,
      Message.ConnectedSession({ sessionId: id }),
    ).model
    const live = update(
      reconnecting,
      Message.ReceivedSnapshot({
        sessionId: id,
        snapshot: { count: 3, version: 4 },
      }),
    ).model
    expect(active(live).mutation._tag).toBe('Pending')
    expect(update(live, Message.ClickedIncrement()).commands).toBeUndefined()
    const settled = update(
      live,
      Message.SucceededMutate({
        sessionId: id,
        snapshot: { count: 3, version: 4 },
      }),
    ).model
    expect(active(settled).mutation._tag).toBe('Idle')
  })

  test('HTTP completion cannot turn a disconnected socket live', () => {
    const pending = update(ready(), Message.ClickedIncrement()).model
    const offline = update(
      pending,
      Message.DisconnectedSession({ sessionId: id }),
    ).model
    const settled = update(
      offline,
      Message.SucceededMutate({
        sessionId: id,
        snapshot: { count: 1, version: 1 },
      }),
    ).model
    expect(active(settled).connection._tag).toBe('Offline')
    expect(active(settled).mutation._tag).toBe('Idle')
    expect(
      Option.getOrThrow(maybeSnapshot(active(settled).connection)).count,
    ).toBe(1)
    expect(update(settled, Message.ClickedIncrement()).commands).toBeUndefined()
  })

  test('typed failure triggers resync without replay', () => {
    story(
      update,
      given(ready(8, 2)),
      message(Message.ClickedReset()),
      Command.expectExact(Mutate),
      Command.resolve(
        Mutate,
        Message.FailedMutate({ sessionId: id, failure: Failure.Timeout() }),
      ),
      model(m => {
        expect(active(m).connection._tag).toBe('Offline')
        expect(Option.getOrThrow(active(m).maybeMutationFailure)._tag).toBe(
          'Timeout',
        )
      }),
      message(Message.ClickedIncrement()),
      Command.expectNone(),
    )
  })

  test('copy failure persists across snapshots, success clears it', () => {
    story(
      update,
      given(ready()),
      message(Message.FailedCopyLink()),
      message(
        Message.ReceivedSnapshot({
          sessionId: id,
          snapshot: { count: 1, version: 1 },
        }),
      ),
      model(m => expect(active(m).copy._tag).toBe('Failed')),
      message(Message.ClickedCopyLink()),
      Command.expectExact(CopyLink),
      Command.resolve(CopyLink, Message.CompletedCopyLink()),
      model(m => expect(active(m).copy._tag).toBe('Copied')),
    )
  })

  test('malformed websocket update is distinct and cleared by a good snapshot', () => {
    story(
      update,
      given(ready()),
      message(Message.ReceivedInvalidSnapshot({ sessionId: id })),
      model(m =>
        expect(Option.getOrThrow(active(m).maybeConnectionFailure)._tag).toBe(
          'InvalidResponse',
        ),
      ),
      message(
        Message.ReceivedSnapshot({
          sessionId: id,
          snapshot: { count: 1, version: 1 },
        }),
      ),
      model(m =>
        expect(Option.isNone(active(m).maybeConnectionFailure)).toBe(true),
      ),
    )
  })

  test('copy and new session are commands', () => {
    story(
      update,
      given(ready()),
      message(Message.ClickedCopyLink()),
      Command.expectExact(CopyLink),
      Command.resolve(CopyLink, Message.CompletedCopyLink()),
    )
    story(
      update,
      given(ready()),
      message(Message.ClickedNewSession()),
      Command.expectExact(OpenNewSession),
      Command.resolve(
        OpenNewSession,
        Message.FailedCreateSession({ failure: Failure.Network() }),
      ),
    )
  })
})
