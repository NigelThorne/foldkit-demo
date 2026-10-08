import { Schema } from 'effect'
import { describe, expect, test } from 'vitest'

import { SessionState, isSessionId } from './session'

describe('session protocol', () => {
  test('only accepts unambiguous UUIDv4 session IDs', () => {
    expect(isSessionId('f44c588d-6e3e-4eb8-a1cd-cf1500c52c83')).toBe(true)
    expect(isSessionId('everyone')).toBe(false)
    expect(isSessionId('../session')).toBe(false)
    expect(isSessionId('F44C588D-6E3E-4EB8-A1CD-CF1500C52C83')).toBe(false)
  })

  test('validates the server state before rendering it', () => {
    const decode = Schema.decodeUnknownSync(SessionState)
    expect(decode({ count: 10, version: 12 })).toEqual({
      count: 10,
      version: 12,
    })
    expect(() => decode({ count: 11, version: 12 })).toThrow()
    expect(() => decode({ count: -1, version: 12 })).toThrow()
    expect(() => decode({ count: 0.5, version: 12 })).toThrow()
    expect(() => decode({ count: 2, version: -1 })).toThrow()
  })
})
