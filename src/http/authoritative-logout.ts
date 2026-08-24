import { Effect } from 'effect'

/**
 * Enforces the logout policy: browser credentials are cleared only after the
 * authoritative provider revocation has completed successfully.
 */
export function revokeBeforeClearingCredentials<
  Revoked,
  RevokeError,
  RevokeServices,
  ClearServices,
>(
  revoke: Effect.Effect<Revoked, RevokeError, RevokeServices>,
  clearCredentials: Effect.Effect<Response, never, ClearServices>
): Effect.Effect<Response, RevokeError, RevokeServices | ClearServices> {
  return Effect.gen(function* () {
    yield* revoke
    return yield* clearCredentials
  })
}
