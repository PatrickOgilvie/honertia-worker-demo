import { Effect, Result, Schema as S } from 'effect'
import type { Env } from 'hono'

import {
  type AppError,
  type BaseServices,
  type EffectHandler,
  type EffectRouteBuilder,
  type EffectRouteOptions,
  HttpError,
  prefersJson,
  renderWithErrors,
  type Validated,
  ValidationError,
  validateUnknown,
} from '@popcomputer/web/effect'
import { parseBoundedRequestBody } from '~/http/bounded-request-body'

const STRICT_PARSE_OPTIONS = { onExcessProperty: 'error' } as const
type StrictFormPageProps = NonNullable<
  Parameters<typeof renderWithErrors>[2]
>

/** Route metadata callers may choose without weakening strict form parsing. */
export type StrictFormRouteOptions = Omit<
  EffectRouteOptions,
  'body' | 'validateBody' | 'parseOptions'
>

/**
 * One form boundary whose preparation, parse policy, and continuations cannot
 * drift apart across the route declaration and action implementation.
 */
export interface StrictFormContract<A, I, E extends AppError, R> {
  readonly schema: S.Codec<A, I>
  readonly handler: EffectHandler<R, E>
}

/** Configuration for an authorization-first, body-only form boundary. */
export interface StrictFormConfig<
  Prepared,
  A,
  I,
  PrepareError extends AppError,
  InvalidError extends AppError,
  ValidError extends AppError,
  PrepareServices,
  InvalidServices,
  ValidServices,
> {
  readonly name: string
  readonly schema: S.Codec<A, I>
  readonly prepare: Effect.Effect<Prepared, PrepareError, PrepareServices>
  readonly onInvalid: (
    errors: Record<string, string>,
    prepared: Prepared
  ) => EffectHandler<InvalidServices, InvalidError>
  readonly onValid: (
    input: Validated<A>,
    prepared: Prepared
  ) => EffectHandler<ValidServices, ValidError>
}

/** Negotiates strict-form validation failures without changing browser UX. */
export function respondWithStrictFormErrors<T extends StrictFormPageProps>(
  component: string,
  errors: Record<string, string>,
  props?: T
) {
  return Effect.gen(function* () {
    if (yield* prefersJson) {
      return yield* new ValidationError({ errors })
    }

    return yield* renderWithErrors(component, errors, props)
  })
}

/**
 * Builds a form action that prepares protected context before reading input,
 * parses the body exactly once, and only exposes safe field errors on failure.
 */
export function defineStrictForm<
  Prepared,
  A,
  I,
  PrepareError extends AppError,
  InvalidError extends AppError,
  ValidError extends AppError,
  PrepareServices,
  InvalidServices,
  ValidServices,
>(
  config: StrictFormConfig<
    Prepared,
    A,
    I,
    PrepareError,
    InvalidError,
    ValidError,
    PrepareServices,
    InvalidServices,
    ValidServices
  >
): StrictFormContract<
  A,
  I,
  | HttpError
  | ValidationError
  | PrepareError
  | InvalidError
  | ValidError,
  | PrepareServices
  | InvalidServices
  | ValidServices
> {
  const handler = Effect.fn(config.name)(function* () {
    const prepared = yield* config.prepare
    const body = yield* parseBoundedRequestBody()
    const validation = yield* Effect.result(
      validateUnknown(config.schema, body, {
        parseOptions: STRICT_PARSE_OPTIONS,
      })
    )

    if (Result.isFailure(validation)) {
      return yield* config.onInvalid(validation.failure.errors, prepared)
    }

    return yield* config.onValid(validation.success, prepared)
  })()

  return { schema: config.schema, handler }
}

function strictRouteOptions<A, I>(
  form: StrictFormContract<A, I, AppError, unknown>,
  options: StrictFormRouteOptions | undefined
): EffectRouteOptions {
  return {
    ...options,
    body: form.schema,
    validateBody: false,
  }
}

/** Registers a POST form without exposing validation-policy escape hatches. */
export function postStrictForm<
  E extends Env,
  Provided,
  Custom,
  A,
  I,
  Error extends AppError,
  Services extends BaseServices | Provided | Custom,
>(
  route: EffectRouteBuilder<E, Provided, Custom>,
  path: string,
  form: StrictFormContract<A, I, Error, Services>,
  options?: StrictFormRouteOptions
): void {
  route.post(path, form.handler, strictRouteOptions(form, options))
}

/** Registers a PUT form without exposing validation-policy escape hatches. */
export function putStrictForm<
  E extends Env,
  Provided,
  Custom,
  A,
  I,
  Error extends AppError,
  Services extends BaseServices | Provided | Custom,
>(
  route: EffectRouteBuilder<E, Provided, Custom>,
  path: string,
  form: StrictFormContract<A, I, Error, Services>,
  options?: StrictFormRouteOptions
): void {
  route.put(path, form.handler, strictRouteOptions(form, options))
}

/** Registers a DELETE form without exposing validation-policy escape hatches. */
export function deleteStrictForm<
  E extends Env,
  Provided,
  Custom,
  A,
  I,
  Error extends AppError,
  Services extends BaseServices | Provided | Custom,
>(
  route: EffectRouteBuilder<E, Provided, Custom>,
  path: string,
  form: StrictFormContract<A, I, Error, Services>,
  options?: StrictFormRouteOptions
): void {
  route.delete(path, form.handler, strictRouteOptions(form, options))
}
