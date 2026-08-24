import { Schema as S } from 'effect'

const OpaqueIdentifier = S.String.check(
  S.isMinLength(1, { message: 'This identifier is required.' }),
  S.isMaxLength(255, { message: 'This identifier is invalid.' })
)

/** A parsed Better Auth user identifier. */
export const UserId = OpaqueIdentifier.pipe(S.brand('UserId'))

/** A parsed Better Auth user identifier. */
export type UserId = S.Schema.Type<typeof UserId>

/** A parsed Better Auth session identifier. */
export const SessionId = S.String.check(
  S.isMinLength(1, { message: 'This session identifier is required.' }),
  S.isMaxLength(128, { message: 'This session identifier is invalid.' })
).pipe(S.brand('SessionId'))

/** A parsed Better Auth session identifier. */
export type SessionId = S.Schema.Type<typeof SessionId>
