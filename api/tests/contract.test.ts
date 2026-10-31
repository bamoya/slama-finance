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
  it('transports staff invitation tokens only in request bodies', async () => {
    const document = JSON.parse(JSON.stringify(await SwaggerParser.dereference(path.pathname))) as {
      paths: Record<string, Record<string, unknown>>
      components: { schemas: Record<string, InvitationSchema> }
    }
    const methods = new Set(['get', 'post', 'put', 'patch', 'delete'])
    type Parameter = { name: string; in: string }
    for (const item of Object.values(document.paths)) {
      const parameters: Parameter[] = []
      for (const [key, value] of Object.entries(item)) {
        if (Array.isArray(value)) parameters.push(...(value as Parameter[]))
        else if (methods.has(key))
          parameters.push(...((value as { parameters?: Parameter[] }).parameters ?? []))
      }
      for (const parameter of parameters)
        expect(['query', 'path'].includes(parameter.in) && /token/i.test(parameter.name)).toBe(
          false,
        )
    }
    const management = [
      '/v1/staff/invitations',
      '/v1/staff/invitations/{invitationId}/resend',
      '/v1/staff/invitations/{invitationId}/revoke',
    ]
    for (const url of management) {
      const item = document.paths[url]
      expect(item).toBeTruthy()
      for (const [method, value] of Object.entries(item ?? {})) {
        if (method !== 'get' && method !== 'post') continue
        const operation = value as {
          'x-permissions'?: string[]
          security?: { organizationStaffCookie?: unknown[] }[]
          responses?: Record<
            string,
            { content?: { 'application/json'?: { schema?: InvitationSchema } } }
          >
        }
        expect(operation.security).toEqual([{ organizationStaffCookie: [], organizationScope: [] }])
        for (const [status, response] of Object.entries(operation.responses ?? {})) {
          if (!/^2\d\d$/.test(status)) continue
          const schema = response.content?.['application/json']?.schema
          if (!schema) throw new Error(`Missing 2xx schema on ${url}`)
          for (const name of collectFieldNames(schema))
            expect(/token|hash|lease/i.test(name)).toBe(false)
        }
      }
    }
    expect(
      (document.paths['/v1/staff/invitations']?.get as { 'x-permissions'?: string[] })[
        'x-permissions'
      ],
    ).toEqual(['staff.read'])
    expect(
      (document.paths['/v1/staff/invitations']?.post as { 'x-permissions'?: string[] })[
        'x-permissions'
      ],
    ).toEqual(['staff.create'])
    expect(
      (
        document.paths['/v1/staff/invitations/{invitationId}/resend']?.post as {
          'x-permissions'?: string[]
        }
      )['x-permissions'],
    ).toEqual(['staff.update'])
    expect(
      (
        document.paths['/v1/staff/invitations/{invitationId}/revoke']?.post as {
          'x-permissions'?: string[]
        }
      )['x-permissions'],
    ).toEqual(['staff.update'])
    for (const url of [
      '/v1/organizations/{organizationId}/auth/invitations/inspect',
      '/v1/organizations/{organizationId}/auth/invitations/accept',
    ]) {
      expect((document.paths[url]?.post as { security?: unknown[] }).security).toEqual([])
    }
    const inspect = requiredSchema(document.components.schemas, 'InspectStaffInvitationInput')
    const accept = requiredSchema(document.components.schemas, 'AcceptStaffInvitationInput')
    for (const schema of [inspect, accept]) {
      expect(schema.required).toContain('token')
      expect(field(schema, 'token').pattern).toBe('^[A-Za-z0-9_-]{43}$')
    }
    expect(accept.required).toEqual(['token', 'firstName', 'lastName', 'password'])
  })
  it('models invitation status separately from delivery and keeps previews minimal', async () => {
    const document = JSON.parse(JSON.stringify(await SwaggerParser.dereference(path.pathname))) as {
      components: { schemas: Record<string, InvitationSchema> }
    }
    const schemas = document.components.schemas
    const invitation = requiredSchema(schemas, 'StaffInvitation')
    expect(field(invitation, 'status').enum).toEqual(['pending', 'accepted', 'revoked', 'expired'])
    const delivery = field(invitation, 'delivery')
    expect(field(delivery, 'state').enum).toEqual([
      'queued',
      'sending',
      'sent',
      'failed',
      'cancelled',
    ])
    expect(delivery.required).toEqual(['state', 'attempts', 'updatedAt'])
    expect(invitation.required).toContain('delivery')
    for (const name of collectFieldNames(invitation))
      expect(/token|hash|lease/i.test(name)).toBe(false)
    const preview = requiredSchema(schemas, 'StaffInvitationPreview')
    expect(Object.keys(preview.properties ?? {}).sort()).toEqual([
      'email',
      'expiresAt',
      'organizationName',
    ])
    for (const name of collectFieldNames(requiredSchema(schemas, 'StaffInvitationAccepted')))
      expect(/token|hash|lease/i.test(name)).toBe(false)
    const create = requiredSchema(schemas, 'CreateStaffInvitation')
    expect(field(create, 'language').enum).toEqual(['fr', 'en'])
    expect(field(create, 'language').default).toBe('fr')
    expect(field(create, 'roleIds').default).toEqual([])
    expect(create.required).toEqual(['email'])
    const password = field(requiredSchema(schemas, 'AcceptStaffInvitationInput'), 'password')
    const resets = field(requiredSchema(schemas, 'PasswordResetConfirm'), 'password')
    expect(password.minLength).toBe(resets.minLength)
    expect(password.minLength).toBe(12)
    expect(password.maxLength).toBe(resets.maxLength)
    expect(password.maxLength).toBe(256)
  })
})

type InvitationSchema = {
  required?: string[]
  properties?: Record<string, InvitationSchema>
  enum?: string[]
  pattern?: string
  minLength?: number
  maxLength?: number
  default?: unknown
  items?: InvitationSchema
}

function requiredSchema(schemas: Record<string, InvitationSchema>, name: string): InvitationSchema {
  const schema = schemas[name]
  if (!schema) throw new Error(`Missing contract schema: ${name}`)
  return schema
}

function field(schema: InvitationSchema, name: string): InvitationSchema {
  const value = schema.properties?.[name]
  if (!value) throw new Error(`Missing contract field: ${name}`)
  return value
}

function collectFieldNames(schema: InvitationSchema, into: Set<string> = new Set()): Set<string> {
  for (const [name, property] of Object.entries(schema.properties ?? {})) {
    into.add(name)
    collectFieldNames(property, into)
    if (property.items) collectFieldNames(property.items, into)
  }
  return into
}
