import { Array, Option } from 'effect'
import type { Document, HtmlBuilder } from 'foldkit/html'

import { Message } from './message'
import {
  Connection,
  Copy,
  Model,
  Session,
  failureText,
  maybeSnapshot,
} from './model'
import { MAX_WINS } from './shared/session'

// VIEW
const activeView = (
  session: Extract<Session, { _tag: 'Active' }>,
  h: HtmlBuilder<Message>,
) => {
  const snapshot = maybeSnapshot(session.connection)
  const count = Option.isSome(snapshot) ? snapshot.value.count : 0
  const canMutate =
    session.connection._tag === 'Live' && session.mutation._tag === 'Idle'
  return h.div(
    [],
    [
      h.p(
        [h.Class('connection'), h.AriaLive('polite')],
        [
          Connection.match(session.connection, {
            Connecting: () => 'Connecting',
            Live: () => 'Live',
            Offline: () => 'Offline',
          }),
        ],
      ),
      h.div(
        [h.Class('count-wrap')],
        [
          h.p(
            [h.Class('count')],
            [Option.isSome(snapshot) ? String(count) : '—'],
          ),
          h.p([h.Class('count-caption')], [`of ${MAX_WINS} wins`]),
        ],
      ),
      h.div(
        [
          h.Class('progress'),
          h.Role('progressbar'),
          h.AriaLabel('Wins this round'),
          h.AriaValuemin(0),
          h.AriaValuemax(MAX_WINS),
          h.AriaValuenow(count),
        ],
        Array.makeBy(MAX_WINS, index =>
          h.span([
            h.Class(index < count ? 'dot dot-filled' : 'dot'),
            h.AriaHidden(true),
          ]),
        ),
      ),
      h.p(
        [h.Class('status'), h.AriaLive('polite')],
        [
          count === MAX_WINS
            ? 'Ten little wins. Nicely done.'
            : count === 0
              ? 'Your next win starts here.'
              : `${count} of ${MAX_WINS} wins. Keep going.`,
        ],
      ),
      h.div(
        [h.Class('actions')],
        [
          h.button(
            [
              h.Class('button button-primary'),
              h.OnClick(Message.ClickedIncrement()),
              h.Disabled(!canMutate || count === MAX_WINS),
            ],
            ['Add a win'],
          ),
          h.button(
            [
              h.Class('button button-secondary'),
              h.OnClick(Message.ClickedReset()),
              h.Disabled(!canMutate || count === 0),
            ],
            ['Start again'],
          ),
        ],
      ),
      Option.isSome(session.maybeMutationFailure)
        ? h.div(
            [h.Role('alert')],
            [
              h.p([], [failureText(session.maybeMutationFailure.value)]),
              h.p(
                [],
                [
                  session.connection._tag === 'Live'
                    ? 'The current count has been refreshed. The earlier action may have been saved.'
                    : 'Reconnecting to check the current count. Do not retry the action yet.',
                ],
              ),
            ],
          )
        : h.empty,
      Option.isSome(session.maybeConnectionFailure)
        ? h.p(
            [h.Role('alert')],
            [
              'Invalid session update. Reconnecting to check the current count.',
            ],
          )
        : h.empty,
      h.div(
        [h.Class('share')],
        [
          h.p([], ['Anyone with this link can add or reset wins.']),
          h.button(
            [
              h.Class('button button-secondary'),
              h.OnClick(Message.ClickedCopyLink()),
            ],
            [
              Copy.match(session.copy, {
                Ready: () => 'Copy link',
                Copied: () => 'Copied!',
                Failed: () => 'Copy link',
              }),
            ],
          ),
          session.copy._tag === 'Failed'
            ? h.p(
                [h.Role('alert')],
                ['Copy failed. Select the link below to share it.'],
              )
            : h.empty,
          h.p([h.Class('share-url')], [session.shareUrl]),
          h.button(
            [
              h.Class('button button-secondary'),
              h.OnClick(Message.ClickedNewSession()),
            ],
            ['New session'],
          ),
        ],
      ),
    ],
  )
}

export const view = (model: Model, h: HtmlBuilder<Message>): Document => {
  const snapshot =
    model.session._tag === 'Active'
      ? maybeSnapshot(model.session.connection)
      : Option.none()
  const count = Option.isSome(snapshot) ? snapshot.value.count : 0
  return {
    title: `Little wins · ${count} of ${MAX_WINS}`,
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
            Session.match(model.session, {
              Creating: ({ maybeFailure }) =>
                h.div(
                  [],
                  [
                    h.p(
                      [h.Class('connection'), h.AriaLive('polite')],
                      ['Connecting'],
                    ),
                    Option.isSome(maybeFailure)
                      ? h.p(
                          [h.Role('alert')],
                          ['Could not create a session. Try again.'],
                        )
                      : h.empty,
                    h.button(
                      [
                        h.Class('button button-secondary'),
                        h.OnClick(Message.ClickedNewSession()),
                      ],
                      ['New session'],
                    ),
                  ],
                ),
              Invalid: () =>
                h.div(
                  [],
                  [
                    h.p([h.Role('alert')], ['This session link is invalid.']),
                    h.button(
                      [
                        h.Class('button button-primary'),
                        h.OnClick(Message.ClickedNewSession()),
                      ],
                      ['New session'],
                    ),
                  ],
                ),
              Active: session => activeView(session, h),
            }),
          ],
        ),
        h.footer(
          [h.Class('footer')],
          ['Built with Foldkit · TypeScript + Effect'],
        ),
      ],
    ),
  }
}
