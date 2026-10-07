import { click, expect, given, role, scene, text } from 'foldkit/scene'
import { describe, test } from 'vitest'

import { update, view } from './main'

describe('little wins page', () => {
  test('shows the starting state and controls', () => {
    scene(
      { update, view },
      given({ count: 0 }),
      expect(role('heading', { name: 'Little wins' })).toExist(),
      expect(text('0')).toExist(),
      expect(role('button', { name: 'Add a win' })).toExist(),
      expect(role('button', { name: 'Start again' })).toExist(),
    )
  })

  test('a click changes the visible count', () => {
    scene(
      { update, view },
      given({ count: 0 }),
      click(role('button', { name: 'Add a win' })),
      expect(text('1')).toExist(),
    )
  })

  test('completes the round and can restart', () => {
    scene(
      { update, view },
      given({ count: 9 }),
      click(role('button', { name: 'Add a win' })),
      expect(text('Ten little wins. Nicely done.')).toExist(),
      click(role('button', { name: 'Start again' })),
      expect(text('0')).toExist(),
      expect(role('button', { name: 'Add a win' })).toExist(),
    )
  })
})
