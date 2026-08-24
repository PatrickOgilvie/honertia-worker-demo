import { describe, expect, test } from 'bun:test'
import { Effect, Exit, Redacted, Schema as S } from 'effect'

import {
  AuthSecret,
  PasswordSecret,
} from '~/domain/auth-credentials'

describe('authentication credentials', () => {
  test('preserves password whitespace while keeping the parsed value redacted', async () => {
    const rawPassword = '  whitespace-is-part-of-this-password  '
    const password = await Effect.runPromise(
      S.decodeUnknownEffect(PasswordSecret)(rawPassword)
    )

    expect(Redacted.value(password)).toBe(rawPassword)
    expect(String(password)).not.toContain(rawPassword)
    expect(JSON.stringify(password)).not.toContain(rawPassword)
  })

  test('rejects an empty password without trimming a non-empty password', async () => {
    const empty = await Effect.runPromiseExit(
      S.decodeUnknownEffect(PasswordSecret)('')
    )
    const whitespace = await Effect.runPromise(
      S.decodeUnknownEffect(PasswordSecret)('   ')
    )

    expect(Exit.isFailure(empty)).toBe(true)
    expect(Redacted.value(whitespace)).toBe('   ')
  })

  test('rejects a password longer than the provider limit before hashing', async () => {
    const oversized = await Effect.runPromiseExit(
      S.decodeUnknownEffect(PasswordSecret)('x'.repeat(129))
    )

    expect(Exit.isFailure(oversized)).toBe(true)
  })

  test('requires a redacted authentication secret of at least 32 characters', async () => {
    const shortSecret = await Effect.runPromiseExit(
      S.decodeUnknownEffect(AuthSecret)('too-short')
    )
    const whitespaceSecret = await Effect.runPromiseExit(
      S.decodeUnknownEffect(AuthSecret)(' '.repeat(32))
    )
    const rawSecret = '0123456789abcdef0123456789abcdef'
    const secret = await Effect.runPromise(
      S.decodeUnknownEffect(AuthSecret)(rawSecret)
    )

    expect(Exit.isFailure(shortSecret)).toBe(true)
    expect(Exit.isFailure(whitespaceSecret)).toBe(true)
    expect(String(secret)).not.toContain(rawSecret)
  })
})
