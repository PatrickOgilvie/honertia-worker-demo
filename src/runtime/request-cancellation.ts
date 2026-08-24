import { Context, Effect, Layer, Option } from 'effect'

/** Optional cancellation propagated by a protocol adapter into an operation. */
export interface CancellableOptions {
  readonly signal?: AbortSignal
}

/** Request-scoped cancellation signal available to application workflows. */
export interface RequestCancellationApi {
  readonly signal: AbortSignal
}

/** Optional request-scoped cancellation capability. */
export class RequestCancellation extends Context.Service<
  RequestCancellation,
  RequestCancellationApi
>()('@app/RequestCancellation') {}

/** Creates a request-scoped cancellation Layer for one incoming request. */
export function makeRequestCancellationLayer(signal: AbortSignal) {
  return Layer.succeed(RequestCancellation, RequestCancellation.of({ signal }))
}

/**
 * Reports cancellation from either explicit options or the optional ambient
 * request capability. `Effect.serviceOption` keeps the helper requirement-free.
 */
export function isRequestCancellationRequested(
  options: CancellableOptions = {}
): Effect.Effect<boolean> {
  return Effect.map(
    Effect.serviceOption(RequestCancellation),
    (requestCancellation) =>
      options.signal?.aborted === true ||
      Option.match(requestCancellation, {
        onNone: () => false,
        onSome: ({ signal }) => signal.aborted,
      })
  )
}

/** Fails with a caller-owned, sanitized error when cancellation was requested. */
export function ensureRequestActive<E>(
  options: CancellableOptions,
  onCancelled: () => E
): Effect.Effect<void, E> {
  return Effect.flatMap(isRequestCancellationRequested(options), (cancelled) =>
    cancelled ? Effect.fail(onCancelled()) : Effect.void
  )
}
