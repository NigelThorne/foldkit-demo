import { Schema } from 'effect'

export const MAX_WINS = 10

export const isSessionId = (value: string): boolean =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
    value,
  )

export const SessionState = Schema.Struct({
  count: Schema.Number.check(
    Schema.isInt(),
    Schema.isBetween({ minimum: 0, maximum: MAX_WINS }),
  ),
  version: Schema.Number.check(
    Schema.isInt(),
    Schema.isGreaterThanOrEqualTo(0),
  ),
})
export type SessionState = typeof SessionState.Type
