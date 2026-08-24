import { Effect, Schema as S } from 'effect'

import {
  effectifyBetterAuth,
  type BetterAuthActionError,
  type BetterAuthBoundaryFailure,
  type BetterAuthEffectClient,
} from '@popcomputer/web/auth'
import {
  AuthRateLimitError,
  AuthRedirect,
  AuthService,
  HttpError,
  RequestService,
  type RequestContext,
  ValidationError,
} from '@popcomputer/web/effect'
import type { Auth } from '~/lib/auth'
import { defineStrictForm } from '~/http/strict-form-route'

/** Configuration for a strictly parsed Better Auth form adapter. */
export interface BetterAuthStrictFormConfig<A, I, Result> {
  readonly name: string
  readonly schema: S.Codec<A, I>
  readonly errorComponent: string
  readonly redirectTo: string
  readonly errorMapper: (
    error: BetterAuthActionError
  ) => Record<string, string>
  readonly call: (
    auth: BetterAuthEffectClient<Auth>,
    input: A,
    request: Request
  ) => Effect.Effect<Result, BetterAuthBoundaryFailure>
}

function safeAuthFailure(
  failure: BetterAuthBoundaryFailure,
  component: string,
  errorMapper: (error: BetterAuthActionError) => Record<string, string>
): AuthRedirect | ValidationError | AuthRateLimitError | HttpError {
  switch (failure._tag) {
    case 'BetterAuthRedirected':
      return new AuthRedirect({
        status: failure.status,
        headers: new Headers(failure.headers),
      })
    case 'BetterAuthRequestRejected':
      return new ValidationError({
        errors: errorMapper(failure.error),
        component,
        headers: new Headers(failure.headers),
      })
    case 'BetterAuthRateLimited':
      return new AuthRateLimitError({
        retryAfterSeconds: failure.retryAfterSeconds,
        cause: 'better-auth-rate-limited',
        headers: new Headers(failure.headers),
      })
    case 'BetterAuthServiceFailed':
      return new HttpError({
        status: failure.status,
        message: 'The authentication service is temporarily unavailable.',
        cause: 'better-auth-service-failed',
        headers: new Headers(failure.headers),
      })
  }
}

function buildAuthRequest(request: RequestContext): Request {
  return new Request(request.url, {
    method: request.method,
    headers: request.headers,
  })
}

function resultHeaders(result: unknown): Headers | undefined {
  if (result instanceof Response || result instanceof Headers) {
    return result instanceof Response ? result.headers : result
  }

  if (!(result instanceof Object)) return undefined

  const headers = Object.getOwnPropertyDescriptor(result, 'headers')?.value
  if (headers === undefined) return undefined

  try {
    return new Headers(headers)
  } catch {
    return undefined
  }
}

function appendSetCookies(target: Headers, source: Headers): number {
  const cookies = source.getSetCookie()
  if (cookies.length > 0) {
    for (const cookie of cookies) {
      target.append('set-cookie', cookie)
    }
    return cookies.length
  }

  const combined = source.get('set-cookie')
  if (combined === null) return 0

  let count = 0
  for (const cookie of combined.split(/,(?=[^;]+?=)/g)) {
    const trimmed = cookie.trim()
    if (trimmed.length > 0) {
      target.append('set-cookie', trimmed)
      count += 1
    }
  }
  return count
}

function responseSetCookies(headers: Headers): ReadonlyArray<string> {
  const cookies = headers.getSetCookie()
  if (cookies.length > 0) return cookies

  const combined = headers.get('set-cookie')
  return combined === null
    ? []
    : combined
        .split(/,(?=[^;]+?=)/g)
        .map((cookie) => cookie.trim())
        .filter((cookie) => cookie.length > 0)
}

function retryAfterSeconds(headers: Headers): number | undefined {
  const raw = headers.get('x-retry-after') ?? headers.get('retry-after')
  if (raw === null || !/^\d+$/.test(raw)) return undefined

  const seconds = Number(raw)
  return Number.isSafeInteger(seconds) && seconds >= 0
    ? seconds
    : undefined
}

async function providerErrorCode(response: Response): Promise<string | undefined> {
  try {
    const body: unknown = await response.clone().json()
    if (!(body instanceof Object)) return undefined

    const code = Object.getOwnPropertyDescriptor(body, 'code')?.value
    return typeof code === 'string' ? code : undefined
  } catch {
    return undefined
  }
}

function providerFailure(
  response: Response
): Effect.Effect<never, BetterAuthBoundaryFailure> {
  const headers = new Headers(response.headers)
  const setCookies = responseSetCookies(headers)

  if (response.status >= 300 && response.status < 400) {
    return Effect.fail({
      _tag: 'BetterAuthRedirected',
      status: response.status,
      cause: 'better-auth-redirected',
      headers,
      setCookies,
    })
  }

  if (response.status === 429) {
    return Effect.fail({
      _tag: 'BetterAuthRateLimited',
      retryAfterSeconds: retryAfterSeconds(headers),
      cause: 'better-auth-rate-limited',
      headers,
      setCookies,
    })
  }

  if (response.status >= 400 && response.status < 500) {
    return Effect.promise(() => providerErrorCode(response)).pipe(
      Effect.flatMap((code) =>
        Effect.fail<BetterAuthBoundaryFailure>({
          _tag: 'BetterAuthRequestRejected',
          error: {
            status: response.status,
            code,
            message: 'Authentication request rejected.',
            body: undefined,
            cause: 'better-auth-request-rejected',
            headers,
            setCookies,
          },
          headers,
          setCookies,
        })
      )
    )
  }

  return Effect.fail({
    _tag: 'BetterAuthServiceFailed',
    status: response.status >= 500 ? response.status : 502,
    cause: 'better-auth-service-failed',
    headers,
    setCookies,
  })
}

/**
 * Runs an internal Better Auth HTTP request so provider router policies such
 * as the D1-backed rate limiter apply without exposing its raw HTTP surface.
 */
export function callBetterAuthHandler(
  auth: BetterAuthEffectClient<Auth>,
  request: Request
): Effect.Effect<Response, BetterAuthBoundaryFailure> {
  return Effect.tryPromise({
    try: () => Promise.resolve(auth.raw.handler(request)),
    catch: (): BetterAuthBoundaryFailure => ({
      _tag: 'BetterAuthServiceFailed',
      status: 502,
      cause: 'better-auth-handler-failed',
      headers: new Headers(),
      setCookies: [],
    }),
  }).pipe(
    Effect.flatMap((response) =>
      response.status >= 300
        ? providerFailure(response)
        : Effect.succeed(response)
    )
  )
}

/**
 * Creates a credentials action whose only password unwrap happens inside the
 * Better Auth call and whose request parser is the shared strict form boundary.
 */
export function defineBetterAuthStrictForm<A, I, Result>(
  config: BetterAuthStrictFormConfig<A, I, Result>
) {
  return defineStrictForm({
    name: config.name,
    schema: config.schema,
    prepare: Effect.all({
      auth: AuthService,
      request: RequestService,
    }),
    onInvalid: (errors) =>
      Effect.fail(
        new ValidationError({
          errors,
          component: config.errorComponent,
        })
      ),
    onValid: (input, context) =>
      Effect.gen(function* () {
        const result = yield* config
          .call(
            effectifyBetterAuth(context.auth),
            input,
            buildAuthRequest(context.request)
          )
          .pipe(
            Effect.mapError((failure) =>
              safeAuthFailure(
                failure,
                config.errorComponent,
                config.errorMapper
              )
            )
          )
        const headers = new Headers({ Location: config.redirectTo })
        const providerHeaders = resultHeaders(result)
        if (
          providerHeaders === undefined ||
          appendSetCookies(headers, providerHeaders) === 0
        ) {
          return yield* new HttpError({
            status: 502,
            message:
              'The authentication service returned an invalid success response.',
          })
        }

        return new Response(null, { status: 303, headers })
      }),
  })
}
