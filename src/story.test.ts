import { Command, given, message, model, story } from 'foldkit/story'
import { describe, expect, test } from 'vitest'

import { Message, init, update } from './main'

describe('little wins', () => {
  test('starts at zero', () => {
    expect(init().model.count).toBe(0)
  })

  test('adds one win without side effects', () => {
    story(
      update,
      given({ count: 0 }),
      message(Message.ClickedIncrement()),
      Command.expectNone(),
      model(model => expect(model.count).toBe(1)),
    )
  })

  test('stops at ten even if another message arrives', () => {
    story(
      update,
      given({ count: 9 }),
      message(Message.ClickedIncrement()),
      message(Message.ClickedIncrement()),
      model(model => expect(model.count).toBe(10)),
    )
  })

  test('reset starts a new round', () => {
    story(
      update,
      given({ count: 10 }),
      message(Message.ClickedReset()),
      model(model => expect(model.count).toBe(0)),
      message(Message.ClickedIncrement()),
      model(model => expect(model.count).toBe(1)),
    )
  })
})
