import { Schema } from 'effect'
import { type Update } from 'foldkit'
import { Document, HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { modifyFields } from 'foldkit/struct'

// MODEL

export const Model = Schema.Struct({ count: Schema.Number })
export type Model = typeof Model.Type

// MESSAGE

export const Message = defineMessageUnion({
  ClickedIncrement: {},
  ClickedReset: {},
})
export type Message = typeof Message.Type

// INIT

export const init = () => ({ model: { count: 0 } })

// UPDATE

export const update = (model: Model, message: Message) =>
  Message.match<Update.Return<Model, Message>>(message, {
    ClickedIncrement: () => ({
      model: modifyFields(model, { count: count => Math.min(count + 1, 10) }),
    }),
    ClickedReset: () => ({ model: modifyFields(model, { count: () => 0 }) }),
  })

// VIEW

export const view = (model: Model, h: HtmlBuilder<Message>): Document => ({
  title: `Little wins · ${model.count} of 10`,
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
          h.div(
            [h.Class('count-wrap')],
            [
              h.p([h.Class('count')], [model.count.toString()]),
              h.p([h.Class('count-caption')], ['of 10 wins']),
            ],
          ),
          h.div(
            [
              h.Class('progress'),
              h.Role('progressbar'),
              h.AriaLabel('Wins this round'),
              h.AriaValuemin(0),
              h.AriaValuemax(10),
              h.AriaValuenow(model.count),
            ],
            Array.from({ length: 10 }, (_, index) =>
              h.span([
                h.Class(index < model.count ? 'dot dot-filled' : 'dot'),
                h.AriaHidden(true),
              ]),
            ),
          ),
          h.p(
            [h.Class('status'), h.AriaLive('polite')],
            [
              model.count === 10
                ? 'Ten little wins. Nicely done.'
                : model.count === 0
                  ? 'Your next win starts here.'
                  : `${model.count} of 10 wins. Keep going.`,
            ],
          ),
          h.div(
            [h.Class('actions')],
            [
              h.button(
                [
                  h.Class('button button-primary'),
                  h.OnClick(Message.ClickedIncrement()),
                  h.Disabled(model.count === 10),
                ],
                ['Add a win'],
              ),
              h.button(
                [
                  h.Class('button button-secondary'),
                  h.OnClick(Message.ClickedReset()),
                  h.Disabled(model.count === 0),
                ],
                ['Start again'],
              ),
            ],
          ),
          h.p([h.Class('refresh-note')], ['Your wins reset when you refresh.']),
        ],
      ),
      h.footer(
        [h.Class('footer')],
        ['Built with Foldkit · TypeScript + Effect'],
      ),
    ],
  ),
})
