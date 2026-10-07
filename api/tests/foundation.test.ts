import { Writable } from 'node:stream'

import { afterEach, describe, expect, it } from 'vitest'
import { z } from 'zod'

import { buildApp } from '../src/app.js'
import { loadEnvironment } from '../src/config/env.js'
import { listStaffQuerySchema } from '../src/contracts/generated/identity/staff.schemas.js'
import { AppError } from '../src/lib/errors.js'
import { loggerOptions } from '../src/lib/logging.js'
import { pageOffset, pageResult, stableSort } from '../src/lib/pagination.js'
import {
  assertVersion,
  companyDate,
  dateSchema,
  FinancialDecimal,
  moneySchema,
  timestampSchema,
  unitPriceSchema,
  weightSchema,
} from '../src/lib/validation.js'
import { prepareAuditEvent } from '../src/modules/audit/writer.js'

const apps: Awaited<ReturnType<typeof buildApp>>[] = []
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()))
})
async function appFor(overrides: NodeJS.ProcessEnv = {}, probe?: () => Promise<void>) {
  const app = await buildApp({
    environment: loadEnvironment({ NODE_ENV: 'test', ...overrides }),
    logger: false,
    readinessProbe: probe,
  })
  apps.push(app)
  return app
}
const trusted = { origin: 'http://localhost:5173' }

describe('environment configuration', () => {
  it('validates business worker controls and never permits recording delivery in production', () => {
    const env = loadEnvironment({ NODE_ENV: 'test', NOTIFICATION_WORKER_ENABLED: 'false' })
    expect(env.NOTIFICATION_WORKER_ENABLED).toBe(false)
    expect(env.NOTIFICATION_PAYLOAD_RETENTION_DAYS).toBe(0)
    for (const input of [
      { NOTIFICATION_WORKER_ENABLED: 'yes' },
      { NOTIFICATION_POLL_MS: '0' },
      { NOTIFICATION_PAYLOAD_RETENTION_DAYS: '-1' },
      { NOTIFICATION_TRANSPORT: 'resend' },
      { NODE_ENV: 'production', NOTIFICATION_TRANSPORT: 'recording' },
    ])
      expect(() => loadEnvironment(input)).toThrow('Invalid environment')
  })
  it('defaults safely and rejects invalid values without disclosing secrets', () => {
    expect(loadEnvironment({}).PORT).toBe(3000)
    for (const input of [
      { PORT: 'NaN' },
      { CORS_ORIGIN: '*' },
      { CORS_ORIGIN: 'https://site.test/path' },
      { NODE_ENV: 'production' },
      { TRUST_PROXY_IPS: 'true' },
      { TRUST_PROXY_IPS: '*' },
      { TRUST_PROXY_IPS: '0.0.0.0/0' },
    ])
      expect(() => loadEnvironment(input)).toThrow('Invalid environment')
    expect(() => loadEnvironment({ DATABASE_URL: 'secret-password' })).toThrow(
      /^Invalid environment configuration: DATABASE_URL$/,
    )
    expect(
      loadEnvironment({
        NODE_ENV: 'production',
        DATABASE_URL: 'postgres://app:secret@db/finance',
        CORS_ORIGIN: 'https://finance.test',
        RESEND_API_KEY: 'test-key',
        EMAIL_FROM: 'security@finance.test',
        PASSWORD_RESET_URL: 'https://finance.test/reset-password',
        S3_ENDPOINT: 'https://storage.finance.test',
        S3_BUCKET: 'private-finance',
        S3_ACCESS_KEY_ID: 'test-access',
        S3_SECRET_ACCESS_KEY: 'test-secret',
      }).CORS_ORIGIN,
    ).toEqual(['https://finance.test'])
  })
  it('fails production startup when private object storage is absent', () => {
    expect(() =>
      loadEnvironment({
        NODE_ENV: 'production',
        DATABASE_URL: 'postgres://app:secret@db/finance',
        CORS_ORIGIN: 'https://finance.test',
        RESEND_API_KEY: 'test-key',
        EMAIL_FROM: 'security@finance.test',
        PASSWORD_RESET_URL: 'https://finance.test/reset-password',
      }),
    ).toThrow('S3_ENDPOINT')
  })
})

describe('HTTP boundaries', () => {
  it('separates live from ready and bounds a stuck readiness probe', async () => {
    const app = await appFor({ READINESS_TIMEOUT_MS: '20' }, () => new Promise(() => {}))
    expect((await app.inject('/health')).json()).toEqual({ status: 'ok' })
    const start = Date.now()
    const response = await app.inject('/ready')
    expect(Date.now() - start).toBeLessThan(500)
    expect(response.statusCode).toBe(503)
    expect(response.json().code).toBe('DATABASE_UNAVAILABLE')
    const ready = await appFor({}, async () => {})
    expect((await ready.inject('/ready')).json()).toEqual({ status: 'ready' })
  })
  it('returns generated IDs and ignores caller request IDs', async () => {
    const app = await appFor()
    const response = await app.inject({ url: '/missing', headers: { 'x-request-id': 'untrusted' } })
    expect(response.statusCode).toBe(404)
    expect(z.string().uuid().safeParse(response.json().requestId).success).toBe(true)
    expect(response.headers['x-request-id']).toBe(response.json().requestId)
    expect(response.headers['cache-control']).toBe('no-store')
    expect(response.headers['x-content-type-options']).toBe('nosniff')
  })
  it('requires exact trusted origins for login/logout and all mutations', async () => {
    const app = await appFor()
    for (const origin of [
      undefined,
      'null',
      'http://localhost:5173.evil.test',
      'http://localhost:5173/',
    ]) {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/auth/logout',
        headers: origin ? { origin } : {},
      })
      expect(response.statusCode).toBe(403)
      expect(response.json().code).toBe('UNTRUSTED_ORIGIN')
    }
    expect(
      (await app.inject({ method: 'POST', url: '/v1/auth/logout', headers: trusted })).statusCode,
    ).toBe(204)
    const preflight = await app.inject({
      method: 'OPTIONS',
      url: '/v1/auth/login',
      headers: { ...trusted, 'access-control-request-method': 'POST' },
    })
    expect(preflight.statusCode).toBe(204)
    expect(preflight.headers['access-control-allow-origin']).toBe(trusted.origin)
    const untrusted = await app.inject({ url: '/health', headers: { origin: 'https://evil.test' } })
    expect(untrusted.headers['access-control-allow-origin']).toBeUndefined()
  })
  it('normalizes validation, malformed JSON, size and rate limit errors', async () => {
    const app = await appFor({ BODY_LIMIT_BYTES: '128' })
    const invalid = await app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      headers: trusted,
      payload: { email: 'bad', password: 'x' },
    })
    expect(invalid.statusCode).toBe(400)
    expect(invalid.json().fieldErrors.email).toBeDefined()
    const malformed = await app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      headers: { ...trusted, 'content-type': 'application/json' },
      payload: '{',
    })
    expect(malformed.statusCode).toBe(400)
    const large = await app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      headers: trusted,
      payload: { password: 'x'.repeat(200) },
    })
    expect(large.statusCode).toBe(413)
    const limited = await appFor({ RATE_LIMIT_MAX: '1' })
    await limited.inject('/health')
    const response = await limited.inject('/health')
    expect(response.statusCode).toBe(429)
    expect(response.json().code).toBe('RATE_LIMITED')
  })
  it('sanitizes unexpected errors and database constraints', async () => {
    const app = await appFor()
    app.get('/test/fail', async () => {
      throw new Error('postgres://user:secret@db private-data')
    })
    app.get('/test/duplicate', async () => {
      throw Object.assign(new Error('private-client-email'), { code: '23505' })
    })
    app.get('/test/conflict', async () => {
      throw new AppError(409, 'STALE_VERSION', 'Reload before saving.')
    })
    for (const path of ['/test/fail', '/test/duplicate', '/test/conflict']) {
      const response = await app.inject(path)
      expect(response.body).not.toMatch(/secret|private-data|private-client-email/)
      expect(response.json().requestId).toBeDefined()
    }
    expect((await app.inject('/test/duplicate')).statusCode).toBe(409)
  })
  it('never logs request bodies, query strings, cookies or raw error causes', async () => {
    let output = ''
    const stream = new Writable({
      write(chunk, _encoding, done) {
        output += chunk.toString()
        done()
      },
    })
    const app = await buildApp({
      environment: loadEnvironment({ NODE_ENV: 'test' }),
      logger: { ...loggerOptions, stream },
    })
    apps.push(app)
    app.post('/test/log', async (request) => {
      request.log.info({ password: 'secret-field' }, 'Boundary test')
      throw new Error('secret-error')
    })
    await app.inject({
      method: 'POST',
      url: '/test/log?token=secret-query',
      headers: {
        ...trusted,
        cookie: 'slama_session=secret-cookie',
        authorization: 'Bearer secret-header',
      },
      payload: { password: 'secret-body' },
    })
    await app.close()
    expect(output).not.toMatch(/secret-(query|cookie|header|body|field|error)/)
    expect(output).toContain('requestId')
  })
})

describe('shared data conventions', () => {
  it('validates pagination and allowlisted stable sorting', () => {
    const schema = listStaffQuerySchema
    expect(schema.parse({})).toMatchObject({ page: 1, pageSize: 25, sort: 'email' })
    for (const bad of [
      { page: '1junk' },
      { pageSize: 101 },
      { sort: 'password_hash' },
      { arbitrary: 'x' },
    ])
      expect(schema.safeParse(bad).success).toBe(false)
    expect(pageOffset({ page: 2, pageSize: 25 })).toBe(25)
    expect(pageResult([], 0, { page: 1, pageSize: 25 })).toEqual({
      items: [],
      total: 0,
      page: 1,
      pageSize: 25,
    })
    expect(stableSort('name', 'asc')).toEqual([
      { field: 'name', direction: 'asc' },
      { field: 'id', direction: 'asc' },
    ])
  })
  it('keeps decimal precision, actual dates and explicit concurrency tokens', () => {
    expect(new FinancialDecimal('0.1').plus('0.2').toFixed(2)).toBe('0.30')
    expect(new FinancialDecimal('1.005').toFixed(2)).toBe('1.01')
    for (const bad of [0.1, '1e3', '-1', '1.001'])
      expect(moneySchema.safeParse(bad).success).toBe(false)
    expect(unitPriceSchema.parse('0.000001')).toBe('0.000001')
    expect(weightSchema.safeParse('0').success).toBe(false)
    expect(dateSchema.safeParse('2026-02-30').success).toBe(false)
    expect(dateSchema.parse('2024-02-29')).toBe('2024-02-29')
    expect(timestampSchema.safeParse('2026-01-01T12:00:00').success).toBe(false)
    expect(companyDate(new Date('2026-01-01T23:30:00Z'))).toBe('2026-01-02')
    expect(() => assertVersion(2, 1)).toThrow('Reload')
  })
  it('allowlists audit values and validates complete composite keys', () => {
    const id = '11111111-1111-4111-8111-111111111111'
    const event = prepareAuditEvent({
      actorKind: 'user',
      actorUserId: id,
      entityTable: 'users',
      entityKey: { id },
      action: 'update',
      afterValues: {
        firstName: 'Staff',
        lastName: 'Member',
        passwordHash: 'secret',
        token: 'secret',
        body: 'private',
      },
    })
    expect(event.afterValues).toEqual({ firstName: 'Staff', lastName: 'Member' })
    expect(() =>
      prepareAuditEvent({
        actorKind: 'system',
        actorUserId: null,
        entityTable: 'user_roles',
        entityKey: { userId: id },
        action: 'grant',
      }),
    ).toThrow()
  })
})
