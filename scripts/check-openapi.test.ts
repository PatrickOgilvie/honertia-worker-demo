import { describe, expect, test } from 'bun:test'

import {
  StaleOpenApiDocument,
  verifyOpenApiDocument,
} from './check-openapi'

describe('OpenAPI artifact verification', () => {
  test('accepts semantic equality independent of object formatting order', () => {
    expect(() =>
      verifyOpenApiDocument(
        { openapi: '3.1.0', info: { title: 'Demo', version: '1' } },
        { info: { version: '1', title: 'Demo' }, openapi: '3.1.0' }
      )
    ).not.toThrow()
  })

  test('rejects a stale checked-in contract', () => {
    expect(() =>
      verifyOpenApiDocument(
        { paths: { '/api/projects': { get: {} } } },
        { paths: { '/api/projects': { get: { security: [] } } } }
      )
    ).toThrow(StaleOpenApiDocument)
  })
})
