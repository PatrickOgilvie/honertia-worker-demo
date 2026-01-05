import { Schema as S } from 'effect'
import { betterAuthFormAction, betterAuthLogoutAction } from 'honertia/auth'
import { requiredString, email } from 'honertia'
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

const mapLoginError = (error: unknown): Record<string, string> => {
  const err = error as { code?: string; message?: string }
  switch (err.code) {
    case 'INVALID_EMAIL':
    case 'INVALID_EMAIL_OR_PASSWORD':
    case 'EMAIL_NOT_VERIFIED':
      return { email: err.message || 'Invalid email or password' }
    case 'CROSS_SITE_NAVIGATION_LOGIN_BLOCKED':
    case 'INVALID_ORIGIN':
    case 'MISSING_OR_NULL_ORIGIN':
      return { email: err.message || 'Request blocked. Please try again.' }
    default:
      return { email: err.message || 'Unable to sign in. Please try again.' }
  }
}

const mapRegisterError = (error: unknown): Record<string, string> => {
  const err = error as { code?: string; message?: string }
  switch (err.code) {
    case 'INVALID_EMAIL':
    case 'USER_ALREADY_EXISTS':
    case 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL':
      return { email: err.message || 'Email is already in use' }
    case 'INVALID_PASSWORD':
    case 'PASSWORD_TOO_SHORT':
    case 'PASSWORD_TOO_LONG':
      return { password: err.message || 'Invalid password' }
    case 'CROSS_SITE_NAVIGATION_LOGIN_BLOCKED':
    case 'INVALID_ORIGIN':
    case 'MISSING_OR_NULL_ORIGIN':
      return { email: err.message || 'Request blocked. Please try again.' }
    default:
      return { email: err.message || 'Unable to register. Please try again.' }
  }
}

export const loginUser = betterAuthFormAction({
  schema: LoginSchema,
  errorComponent: 'Auth/Login',
  redirectTo: '/',
  errorMapper: mapLoginError,
  call: (auth, input, request) =>
    (auth as Auth).api.signInEmail({
      body: { email: input.email, password: input.password },
      request,
      returnHeaders: true,
    }),
})

export const registerUser = betterAuthFormAction({
  schema: RegisterSchema,
  errorComponent: 'Auth/Register',
  redirectTo: '/',
  errorMapper: mapRegisterError,
  call: (auth, input, request) =>
    (auth as Auth).api.signUpEmail({
      body: { name: input.name, email: input.email, password: input.password },
      request,
      returnHeaders: true,
    }),
})

export const logoutUser = betterAuthLogoutAction({
  redirectTo: '/login',
})
