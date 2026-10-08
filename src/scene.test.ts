import { Option } from 'effect'
import { Command, click, expect, given, role, scene, text } from 'foldkit/scene'
import { describe, test } from 'vitest'

import { CopyLink, Message, type Model, Mutate, update, view } from './main'
import { Connection, Failure, Session, activeSession } from './model'

const id = '12345678-1234-4123-8123-123456789abc'
const ready = (count: number, offline = false): Model => ({
  session: Session.Active({
    ...active(),
    connection: offline
      ? Connection.Offline({
          maybeSnapshot: Option.some({ count, version: 1 }),
        })
      : Connection.Live({ snapshot: { count, version: 1 } }),
  }),
})

const active = () => {
  const session = activeSession(id, `https://example.com/?session=${id}`)
  if (session._tag !== 'Active') {
    throw new Error('Expected active session')
  }
  return session
}

describe('shared wins page', () => {
  test('shows accessible live controls and share warning', () => {
    scene(
      { update, view },
      given(ready(0)),
      expect(role('heading', { name: 'Little wins' })).toExist(),
      expect(text('0')).toExist(),
      expect(role('button', { name: 'Add a win' })).toBeEnabled(),
      expect(role('button', { name: 'Start again' })).toBeDisabled(),
      expect(role('button', { name: 'Copy link' })).toExist(),
      expect(text('Anyone with this link can add or reset wins.')).toExist(),
    )
  })

  test('offline disables mutations', () => {
    scene(
      { update, view },
      given(ready(4, true)),
      expect(role('button', { name: 'Add a win' })).toBeDisabled(),
      expect(role('button', { name: 'Start again' })).toBeDisabled(),
    )
  })

  test('a resynced mutation failure no longer claims to be reconnecting', () => {
    const base = ready(1)
    if (base.session._tag !== 'Active') {
      throw new Error('Expected active session')
    }
    scene(
      { update, view },
      given({
        session: Session.Active({
          ...base.session,
          maybeMutationFailure: Option.some(Failure.Timeout()),
        }),
      }),
      expect(
        text(
          'The current count has been refreshed. The earlier action may have been saved.',
        ),
      ).toExist(),
    )
  })

  test('invalid link offers a new session', () => {
    scene(
      { update, view },
      given({ session: Session.Invalid() }),
      expect(text('This session link is invalid.')).toExist(),
      expect(role('button', { name: 'New session' })).toExist(),
    )
  })

  test('click does not optimistically update visible count', () => {
    scene(
      { update, view },
      given(ready(2)),
      click(role('button', { name: 'Add a win' })),
      expect(text('2')).toExist(),
      expect(role('button', { name: 'Add a win' })).toBeDisabled(),
      Command.resolve(
        Mutate,
        Message.SucceededMutate({
          sessionId: id,
          snapshot: { count: 3, version: 2 },
        }),
      ),
    )
  })

  test('copy failure remains an accessible alert after a new snapshot', () => {
    scene(
      { update, view },
      given(ready(0)),
      click(role('button', { name: 'Copy link' })),
      Command.resolve(CopyLink, Message.FailedCopyLink()),
      expect(role('alert')).toExist(),
    )
  })
})
