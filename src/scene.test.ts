import { Option } from 'effect'
import { Command, click, expect, given, role, scene, text } from 'foldkit/scene'
import { describe, test } from 'vitest'

import { Message, type Model, Mutate, update, view } from './main'

const id = '12345678-1234-4123-8123-123456789abc'
const ready = (
  count: number,
  connection: Model['connection'] = 'Live',
): Model => ({
  sessionId: Option.some(id),
  invalidSession: false,
  snapshot: Option.some({ count, version: 1 }),
  connection,
  pending: false,
  reconnectEpoch: 0,
  error: Option.none(),
  copied: false,
  shareUrl: `https://example.com/?session=${id}`,
})

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
      given(ready(4, 'Offline')),
      expect(role('button', { name: 'Add a win' })).toBeDisabled(),
      expect(role('button', { name: 'Start again' })).toBeDisabled(),
    )
  })

  test('invalid link offers a new session', () => {
    scene(
      { update, view },
      given({ ...ready(0), invalidSession: true }),
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
})
