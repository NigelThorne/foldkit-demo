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

const id = '12345678-1234-4123-8123-123456789abc'
const other = '12345678-1234-4123-8123-123456789abd'
const ready = (count = 0, version = 0): Model => ({
  sessionId: Option.some(id),
  invalidSession: false,
  snapshot: Option.some({ count, version }),
  connection: 'Live',
  pending: false,
  reconnectEpoch: 0,
  error: Option.none(),
  copied: false,
  shareUrl: `https://example.com/?session=${id}`,
})

describe('shared wins', () => {
  test('initializes from an explicit URL without browser globals', () => {
    expect(
      Option.getOrThrow(
        init(`https://example.com/?session=${id}`).model.sessionId,
      ),
    ).toBe(id)
    expect(
      init('https://example.com/?session=invalid').model.invalidSession,
    ).toBe(true)
    expect(init('https://example.com/').commands).toHaveLength(1)
  })

  test('requests increment without optimistic count', () => {
    story(
      update,
      given(ready()),
      message(Message.ClickedIncrement()),
      Command.expectExact(Mutate),
      model(m => {
        expect(m.pending).toBe(true)
        expect(Option.getOrThrow(m.snapshot).count).toBe(0)
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
    story(
      update,
      given({ ...ready(), connection: 'Offline' }),
      message(Message.ClickedIncrement()),
      Command.expectNone(),
    )
    story(
      update,
      given({ ...ready(), snapshot: Option.none() }),
      message(Message.ClickedIncrement()),
      Command.expectNone(),
    )
    story(
      update,
      given({ ...ready(), pending: true }),
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
        expect(Option.getOrThrow(m.snapshot)).toEqual({ count: 4, version: 5 }),
      ),
    )
  })

  test('reset requests one mutation and failure disables more actions', () => {
    story(
      update,
      given(ready(8, 2)),
      message(Message.ClickedReset()),
      Command.expectExact(Mutate),
      Command.resolve(Mutate, Message.FailedMutate({ sessionId: id })),
      model(m => {
        expect(m.connection).toBe('Offline')
        expect(Option.isSome(m.error)).toBe(true)
      }),
      message(Message.ClickedIncrement()),
      Command.expectNone(),
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
      Command.resolve(OpenNewSession, Message.FailedCreateSession()),
    )
  })
})
