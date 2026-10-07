import { createRequire } from 'node:module'

import SwaggerParser from '@apidevtools/swagger-parser'
import { Ajv2020 } from 'ajv/dist/2020.js'
import type { FormatsPlugin } from 'ajv-formats'
import { describe, expect, it } from 'vitest'

import { buildApp } from '../src/app.js'
import { loadEnvironment } from '../src/config/env.js'

const path = new URL('../openapi/openapi.yaml', import.meta.url)
const addFormats = createRequire(import.meta.url)('ajv-formats') as FormatsPlugin
describe('OpenAPI source contract', () => {
  it('requires separate first and family names when creating staff', async () => {
    const source = JSON.parse(JSON.stringify(await SwaggerParser.dereference(path.pathname)))
    const ajv = new Ajv2020({ strict: false })
    addFormats(ajv)
    const validate = ajv.compile(source.components.schemas.CreateStaff)
    const staff = { email: 'staff@example.test' }
    expect(validate({ ...staff, firstName: 'Sara', lastName: 'Amrani' })).toBe(true)
    expect(validate({ ...staff, name: 'Sara Amrani' })).toBe(false)
    expect(validate({ ...staff, firstName: 'Sara' })).toBe(false)
    expect(validate({ ...staff, firstName: '', lastName: 'Amrani' })).toBe(false)
  })
  it('is valid OpenAPI and has unique operation identifiers', async () => {
    const document = await SwaggerParser.validate(path.pathname)
    const ids: string[] = []
    for (const item of Object.values(document.paths ?? {})) {
      for (const [method, operation] of Object.entries(item ?? {})) {
        if (!['get', 'post', 'put', 'patch', 'delete'].includes(method)) continue
        const typed = operation as { operationId: string }
        expect(typed.operationId).toBeTruthy()
        ids.push(typed.operationId)
      }
    }
    expect(new Set(ids).size).toBe(ids.length)
    expect(Object.keys(document.paths ?? {})).not.toContain('/v1/auth/google')
  })
  it('matches real health/readiness and standard-error response shapes', async () => {
    const source = JSON.parse(JSON.stringify(await SwaggerParser.dereference(path.pathname)))
    const ajv = new Ajv2020({ strict: false })
    addFormats(ajv)
    ajv.addSchema({ $id: 'contract', ...source })
    const validate = (name: string, value: unknown) =>
      ajv.validate({ $ref: `contract#/components/schemas/${name}` }, value)
    const app = await buildApp({
      environment: loadEnvironment({ NODE_ENV: 'test' }),
      logger: false,
    })
    try {
      expect(validate('Health', (await app.inject('/health')).json())).toBe(true)
      expect(validate('Error', (await app.inject('/ready')).json())).toBe(true)
      expect(validate('Error', (await app.inject('/missing')).json())).toBe(true)
      expect(validate('Error', (await app.inject('/v1/auth/session')).json())).toBe(true)
      expect(validate('Error', { code: 'BAD', message: 'Missing ID' })).toBe(false)
    } finally {
      await app.close()
    }
    const ready = await buildApp({
      environment: loadEnvironment({ NODE_ENV: 'test' }),
      logger: false,
      readinessProbe: async () => {},
    })
    try {
      expect(validate('Readiness', (await ready.inject('/ready')).json())).toBe(true)
    } finally {
      await ready.close()
    }
  })
})
