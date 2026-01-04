import { Effect, Schema as S, Either } from 'effect'
import {
  AuthService,
  RequestService,
  renderWithErrors,
  validateRequest,
  requiredString,
  email,
} from 'honertia'
import type { Auth } from '~/lib/auth'

const LoginSchema = S.Struct({
  email,
  password: requiredString,
})

const RegisterSchema = S.Struct({
  name: requiredString,
  email,
  password: requiredString,
})

type AuthApiError = {
  body?: {
    code?: string
    message?: string
  }
  message?: string
}

function getAuthErrorInfo(error: unknown) {
  if (!error || typeof error !== 'object') {
    return { code: undefined, message: undefined }
  }

  const authError = error as AuthApiError

  return {
    code: typeof authError.body?.code === 'string' ? authError.body.code : undefined,
    message:
      typeof authError.body?.message === 'string'
        ? authError.body.message
        : typeof authError.message === 'string'
          ? authError.message
          : undefined,
  }
}

function mapLoginError(error: unknown): Record<string, string> {
  const { code, message } = getAuthErrorInfo(error)

  switch (code) {
    case 'INVALID_EMAIL':
    case 'INVALID_EMAIL_OR_PASSWORD':
    case 'EMAIL_NOT_VERIFIED':
      return { email: message || 'Invalid email or password' }
    case 'CROSS_SITE_NAVIGATION_LOGIN_BLOCKED':
    case 'INVALID_ORIGIN':
    case 'MISSING_OR_NULL_ORIGIN':
      return { email: message || 'Request blocked. Please try again.' }
    default:
      return { email: message || 'Unable to sign in. Please try again.' }
  }
}

function mapRegisterError(error: unknown): Record<string, string> {
  const { code, message } = getAuthErrorInfo(error)

  switch (code) {
    case 'INVALID_EMAIL':
    case 'USER_ALREADY_EXISTS':
    case 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL':
      return { email: message || 'Email is already in use' }
    case 'INVALID_PASSWORD':
    case 'PASSWORD_TOO_SHORT':
    case 'PASSWORD_TOO_LONG':
      return { password: message || 'Invalid password' }
    case 'CROSS_SITE_NAVIGATION_LOGIN_BLOCKED':
    case 'INVALID_ORIGIN':
    case 'MISSING_OR_NULL_ORIGIN':
      return { email: message || 'Request blocked. Please try again.' }
    default:
      return { email: message || 'Unable to register. Please try again.' }
  }
}

function buildAuthRequest(request: {
  url: string
  method: string
  headers: Headers
}) {
  return new Request(request.url, {
    method: request.method,
    headers: request.headers,
  })
}

function appendSetCookies(target: Headers, source: Headers) {
  const getSetCookie = (source as unknown as { getSetCookie?: () => string[] })
    .getSetCookie

  if (typeof getSetCookie === 'function') {
    for (const cookie of getSetCookie.call(source)) {
      target.append('set-cookie', cookie)
    }
    return
  }

  const setCookie = source.get('set-cookie')
  if (!setCookie) {
    return
  }

  // Split on cookie boundaries without breaking Expires attributes.
  const parts = setCookie
    .split(/,(?=[^;]+?=)/g)
    .map((part) => part.trim())
    .filter(Boolean)

  for (const cookie of parts) {
    target.append('set-cookie', cookie)
  }
}

function appendExpiredCookie(
  target: Headers,
  name: string,
  options: { secure?: boolean } = {}
) {
  const base = `${name}=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax`
  const value = options.secure ? `${base}; Secure` : base
  target.append('set-cookie', value)
}

function appendLogoutCookies(target: Headers) {
  const cookieNames = [
    'better-auth.session_token',
    'better-auth.session_data',
    'better-auth.account_data',
    'better-auth.dont_remember',
  ]

  for (const name of cookieNames) {
    appendExpiredCookie(target, name)
    appendExpiredCookie(target, `__Secure-${name}`, { secure: true })
  }
}

export const loginUser = Effect.gen(function* () {
  const auth = (yield* AuthService) as Auth
  const request = yield* RequestService

  const input = yield* validateRequest(LoginSchema, {
    errorComponent: 'Auth/Login',
  })

  const attempt = yield* Effect.tryPromise({
    try: () =>
      auth.api.signInEmail({
        body: {
          email: input.email,
          password: input.password,
        },
        request: buildAuthRequest(request),
        returnHeaders: true,
      }) as Promise<{ headers: Headers }>,
    catch: (error) => error,
  }).pipe(Effect.either)

  if (Either.isLeft(attempt)) {
    return yield* renderWithErrors('Auth/Login', mapLoginError(attempt.left))
  }

  const { headers } = attempt.right
  const responseHeaders = new Headers({
    Location: '/',
  })
  appendSetCookies(responseHeaders, headers)

  return new Response(null, {
    status: 303,
    headers: responseHeaders,
  })
})

export const registerUser = Effect.gen(function* () {
  const auth = (yield* AuthService) as Auth
  const request = yield* RequestService

  const input = yield* validateRequest(RegisterSchema, {
    errorComponent: 'Auth/Register',
  })

  const attempt = yield* Effect.tryPromise({
    try: () =>
      auth.api.signUpEmail({
        body: {
          name: input.name,
          email: input.email,
          password: input.password,
        },
        request: buildAuthRequest(request),
        returnHeaders: true,
      }) as Promise<{ headers: Headers }>,
    catch: (error) => error,
  }).pipe(Effect.either)

  if (Either.isLeft(attempt)) {
    return yield* renderWithErrors('Auth/Register', mapRegisterError(attempt.left))
  }

  const { headers } = attempt.right
  const responseHeaders = new Headers({
    Location: '/',
  })
  appendSetCookies(responseHeaders, headers)

  return new Response(null, {
    status: 303,
    headers: responseHeaders,
  })
})

export const logoutUser = Effect.gen(function* () {
  const auth = (yield* AuthService) as Auth
  const request = yield* RequestService

  const attempt = yield* Effect.tryPromise({
    try: () =>
      auth.api.signOut({
        headers: request.headers,
        returnHeaders: true,
      }) as Promise<{ headers: Headers }>,
    catch: (error) => error,
  }).pipe(Effect.either)

  const responseHeaders = new Headers({
    Location: '/login',
  })

  if (Either.isRight(attempt)) {
    appendSetCookies(responseHeaders, attempt.right.headers)
  } else {
    appendLogoutCookies(responseHeaders)
  }

  return new Response(null, {
    status: 303,
    headers: responseHeaders,
  })
})
