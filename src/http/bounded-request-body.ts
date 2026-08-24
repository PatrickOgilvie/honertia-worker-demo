import { Context, Effect, Layer, Option } from 'effect'

import {
  createBodyParseValidationError,
  HttpError,
  ValidationError,
} from '@popcomputer/web/effect'

const MAX_FORM_BODY_BYTES = 8 * 1024

class PayloadTooLarge extends Error {}

/** Raw request capability consumed only after a strict form has prepared context. */
export class RawRequest extends Context.Service<RawRequest, Request>()(
  '@app/RawRequest'
) {}

/** Provides one incoming request to the strict, bounded form parser. */
export function makeRawRequestLayer(request: Request) {
  return Layer.succeed(RawRequest, request)
}

function isJsonContentType(contentType: string): boolean {
  const mediaType = contentType.toLowerCase().split(';')[0]?.trim() ?? ''
  return mediaType.endsWith('/json') || mediaType.endsWith('+json')
}

function declaredBodyTooLarge(request: Request): boolean {
  if (request.headers.has('transfer-encoding')) return false
  const raw = request.headers.get('content-length')
  if (raw === null || !/^\d+$/.test(raw)) return false

  try {
    return BigInt(raw) > BigInt(MAX_FORM_BODY_BYTES)
  } catch {
    return false
  }
}

async function readBoundedBytes(request: Request): Promise<Uint8Array> {
  if (declaredBodyTooLarge(request)) throw new PayloadTooLarge()
  if (request.body === null) return new Uint8Array()

  const reader = request.body.getReader()
  const chunks: Array<Uint8Array> = []
  let size = 0

  try {
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) break

      size += chunk.value.byteLength
      if (size > MAX_FORM_BODY_BYTES) {
        await reader.cancel().catch(() => undefined)
        throw new PayloadTooLarge()
      }
      chunks.push(chunk.value)
    }
  } finally {
    reader.releaseLock()
  }

  const body = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    body.set(chunk, offset)
    offset += chunk.byteLength
  }
  return body
}

function formDataRecord(
  formData: FormData
): Record<string, FormDataEntryValue> {
  return Object.fromEntries(formData.entries())
}

async function parseBytes(
  bytes: Uint8Array,
  contentType: string
): Promise<unknown> {
  if (isJsonContentType(contentType)) {
    const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes))
    return parsed
  }

  const normalized = contentType.toLowerCase()
  if (
    normalized.startsWith('application/x-www-form-urlencoded') ||
    normalized.startsWith('multipart/form-data')
  ) {
    const formData = await new Response(Uint8Array.from(bytes).buffer, {
      headers: { 'Content-Type': contentType },
    }).formData()
    return formDataRecord(formData)
  }

  return {}
}

/** Reads and parses a small request body exactly once after form preparation. */
export function parseBoundedRequestBody(): Effect.Effect<
  unknown,
  HttpError | ValidationError
> {
  return Effect.gen(function* () {
    const request = yield* Effect.serviceOption(RawRequest)
    if (Option.isNone(request)) {
      return yield* new HttpError({
        status: 500,
        message: 'The request body boundary is not configured.',
      })
    }

    const requestCancelled = () => request.value.signal.aborted
    const cancelledError = () =>
      new HttpError({
        status: 408,
        message: 'The request was cancelled before its body was received.',
      })
    if (requestCancelled()) return yield* cancelledError()

    const contentType = request.value.headers.get('content-type') ?? ''
    const bytes = yield* Effect.tryPromise({
      try: () => readBoundedBytes(request.value),
      catch: (cause) =>
        requestCancelled()
          ? cancelledError()
          : cause instanceof PayloadTooLarge
          ? new HttpError({
              status: 413,
              message: 'Payload too large.',
            })
          : createBodyParseValidationError(
              new Error('request-body-read-failed'),
              contentType
            ),
    })
    if (requestCancelled()) return yield* cancelledError()

    const parsed = yield* Effect.tryPromise({
      try: () => parseBytes(bytes, contentType),
      catch: () =>
        requestCancelled()
          ? cancelledError()
          : createBodyParseValidationError(
              new Error('request-body-invalid'),
              contentType
            ),
    })
    if (requestCancelled()) return yield* cancelledError()

    return parsed
  })
}
