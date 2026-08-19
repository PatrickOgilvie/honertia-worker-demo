import { Schema as S } from 'effect'
import {
  betterAuthFormAction,
  betterAuthLogoutAction,
  type BetterAuthActionError,
} from '@popcomputer/web/auth'
import { requiredString, email } from '@popcomputer/web/schema'

const LoginSchema = S.Struct({
  email,
  password: requiredString,
})

const RegisterSchema = S.Struct({
  name: requiredString,
  email,
  password: requiredString,
})

const mapLoginError = (error: BetterAuthActionError): Record<string, string> => {
  switch (error.code) {
    case 'INVALID_EMAIL':
    case 'INVALID_EMAIL_OR_PASSWORD':
    case 'EMAIL_NOT_VERIFIED':
      return { email: error.message || 'Invalid email or password' }
    case 'CROSS_SITE_NAVIGATION_LOGIN_BLOCKED':
    case 'INVALID_ORIGIN':
    case 'MISSING_OR_NULL_ORIGIN':
      return { email: error.message || 'Request blocked. Please try again.' }
    default:
      return { email: error.message || 'Unable to sign in. Please try again.' }
  }
}

const mapRegisterError = (error: BetterAuthActionError): Record<string, string> => {
  switch (error.code) {
    case 'INVALID_EMAIL':
    case 'USER_ALREADY_EXISTS':
    case 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL':
      return { email: error.message || 'Email is already in use' }
    case 'INVALID_PASSWORD':
    case 'PASSWORD_TOO_SHORT':
    case 'PASSWORD_TOO_LONG':
      return { password: error.message || 'Invalid password' }
    case 'CROSS_SITE_NAVIGATION_LOGIN_BLOCKED':
    case 'INVALID_ORIGIN':
    case 'MISSING_OR_NULL_ORIGIN':
      return { email: error.message || 'Request blocked. Please try again.' }
    default:
      return { email: error.message || 'Unable to register. Please try again.' }
  }
}

export const loginUser = betterAuthFormAction({
  schema: LoginSchema,
  errorComponent: 'Auth/Login',
  redirectTo: '/',
  errorMapper: mapLoginError,
  call: (auth, input, request) =>
    auth.api.signInEmail({
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
    auth.api.signUpEmail({
      body: { name: input.name, email: input.email, password: input.password },
      request,
      returnHeaders: true,
    }),
})

export const logoutUser = betterAuthLogoutAction({
  redirectTo: '/login',
})
