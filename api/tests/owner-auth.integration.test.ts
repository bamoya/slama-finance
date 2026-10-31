import { createHash } from 'node:crypto'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { buildApp } from '../src/app.js'
import { loadEnvironment } from '../src/config/env.js'
import type { OwnerAccountDelivery } from '../src/integrations/contracts.js'
import { attachTestDatabase, isolatedDatabase } from './helpers/postgres.js'

const headers = { origin: 'http://localhost:5173' }
const email = 'owner@example.test'
const password = 'owner-password-2026'
type Message = Parameters<OwnerAccountDelivery['send']>[0]
const token = (message: Message) =>
  new URLSearchParams(new URL(message.url).hash.slice(1)).get('token')!

describe('Independent platform-owner authentication', () => {
  let fixture: Awaited<ReturnType<typeof isolatedDatabase>>
  let app: Awaited<ReturnType<typeof buildApp>>
  let messages: Message[]
  beforeEach(async () => {
    fixture = await isolatedDatabase()
    messages = []
    app = await buildApp({
      environment: loadEnvironment({
        NODE_ENV: 'test',
        OWNER_AUTH_ENABLED: 'true',
        OWNER_PORTAL_ORIGIN: 'http://localhost:5173',
        CORS_ORIGIN: 'http://localhost:5173,http://localhost:5174',
      }),
      logger: false,
      ownerAccountDelivery: {
        async send(message) {
          messages.push(message)
        },
      },
    })
    attachTestDatabase(app, fixture)
  })
  afterEach(async () => {
    await app?.close()
    await fixture?.cleanup()
  })
  const names = { firstName: 'Amel', lastName: 'Ben Salah' }
  const post = (path: string, payload: object) =>
    app.inject({ method: 'POST', url: `/api/v1/owner-auth/${path}`, headers, payload })
  it('requires trimmed first and last names at registration', async () => {
    for (const payload of [
      { email, password },
      { email, password, firstName: 'Amel' },
      { email, password, lastName: 'Ben Salah' },
      { email, password, firstName: 'Amel', lastName: '   ' },
    ])
      expect((await post('register', payload)).statusCode).toBe(400)
    expect(messages).toHaveLength(0)
    await post('register', { email, password, firstName: '  Amel ', lastName: ' Ben Salah ' })
    const [row] =
      await fixture.client`select first_name, last_name from platform_users where email=${email}`
    expect(row).toMatchObject({ first_name: 'Amel', last_name: 'Ben Salah' })
  })

  it('rejects empty and over-long names at registration', async () => {
    for (const payload of [
      { email, password, firstName: '', lastName: 'Ben Salah' },
      { email, password, firstName: 'x'.repeat(101), lastName: 'Ben Salah' },
    ])
      expect((await post('register', payload)).statusCode).toBe(400)
    expect(messages).toHaveLength(0)
  })

  async function verifiedOwner() {
    expect((await post('register', { email, password, ...names })).statusCode).toBe(202)
    expect((await post('verification/confirm', { token: token(messages[0]!) })).statusCode).toBe(
      204,
    )
  }
  async function login() {
    return post('login', { email, password })
  }

  it('registers separately, requires verification and never returns hashes or tokens in JSON', async () => {
    const result = await post('register', {
      email: 'Owner@Example.Test',
      password,
      ...names,
      locale: 'en',
    })
    expect(result.statusCode).toBe(202)
    expect(result.body).not.toContain('token')
    expect(messages).toHaveLength(1)
    expect(messages[0]).toMatchObject({ to: email, purpose: 'verify_email', language: 'en' })
    expect(new URL(messages[0]!.url).search).toBe('')
    expect((await login()).statusCode).toBe(403)
    const [owner] =
      await fixture.client`select password_hash from platform_users where email=${email}`
    expect(owner?.password_hash).not.toBe(password)
    const [staff] =
      await fixture.client`select count(*)::int as count from users where email=${email}`
    expect(staff?.count).toBe(0)
    const raw = token(messages[0]!)
    const [stored] = await fixture.client`select token_hash from owner_account_tokens`
    expect(stored?.token_hash).toBe(createHash('sha256').update(raw).digest('hex'))
    expect((await post('verification/confirm', { token: raw })).statusCode).toBe(204)
    expect((await post('verification/confirm', { token: raw })).statusCode).toBe(400)
    const signedIn = await login()
    expect(signedIn.statusCode).toBe(200)
    expect(signedIn.json().owner).toMatchObject({ email, locale: 'en' })
    expect(signedIn.body).not.toMatch(/passwordHash|password_hash|token/)
    const cookie = signedIn.cookies.find((c) => c.name === 'slama_owner_session')!
    expect(cookie.httpOnly).toBe(true)
    expect(cookie.sameSite).toBe('Lax')
    expect(
      (
        await app.inject({
          method: 'GET',
          url: '/api/v1/owner-auth/session',
          cookies: { slama_owner_session: cookie.value },
        })
      ).statusCode,
    ).toBe(200)
    expect(
      (
        await app.inject({
          method: 'GET',
          url: '/api/v1/auth/session',
          cookies: { slama_owner_session: cookie.value },
        })
      ).statusCode,
    ).toBe(401)
    expect(
      (
        await app.inject({
          method: 'GET',
          url: '/api/v1/staff',
          cookies: { slama_owner_session: cookie.value },
        })
      ).statusCode,
    ).toBe(403)
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/v1/owner-auth/logout',
          headers,
          cookies: { slama_owner_session: cookie.value },
        })
      ).statusCode,
    ).toBe(204)
    expect(
      (
        await app.inject({
          method: 'GET',
          url: '/api/v1/owner-auth/session',
          cookies: { slama_owner_session: cookie.value },
        })
      ).statusCode,
    ).toBe(401)
  })

  it('uses generic requests and prevents duplicate signup from replacing credentials', async () => {
    await verifiedOwner()
    const duplicate = await post('register', {
      email,
      password: 'different-password-2026',
      ...names,
    })
    expect(duplicate.statusCode).toBe(202)
    expect(messages).toHaveLength(1)
    expect((await login()).statusCode).toBe(200)
    const unknown = await post('password-reset/request', { email: 'unknown@example.test' })
    const known = await post('password-reset/request', { email })
    expect(known.body).toBe(unknown.body)
    await post('password-reset/request', { email })
    expect(messages.filter((m) => m.purpose === 'reset_password')).toHaveLength(1)
  })

  it('consumes a reset once under concurrency, revokes sessions and keeps token purposes distinct', async () => {
    await verifiedOwner()
    const signedIn = await login()
    const cookie = signedIn.cookies.find((c) => c.name === 'slama_owner_session')!.value
    await post('password-reset/request', { email })
    const raw = token(messages.at(-1)!)
    expect((await post('verification/confirm', { token: raw })).statusCode).toBe(400)
    const results = await Promise.all([
      post('password-reset/confirm', { token: raw, password: 'replacement-password-2026' }),
      post('password-reset/confirm', { token: raw, password: 'replacement-password-2026' }),
    ])
    expect(results.map((r) => r.statusCode).sort()).toEqual([204, 400])
    expect(
      (
        await app.inject({
          method: 'GET',
          url: '/api/v1/owner-auth/session',
          cookies: { slama_owner_session: cookie },
        })
      ).statusCode,
    ).toBe(401)
    expect((await login()).statusCode).toBe(401)
    expect((await post('login', { email, password: 'replacement-password-2026' })).statusCode).toBe(
      200,
    )
  })

  it('rejects expired tokens, disabled owners, weak passwords and untrusted origins', async () => {
    expect((await post('register', { email, password: 'short', ...names })).statusCode).toBe(400)
    await verifiedOwner()
    await post('password-reset/request', { email })
    await fixture.client`update owner_account_tokens set expires_at=now()-interval '1 minute' where purpose='reset_password'`
    expect(
      (
        await post('password-reset/confirm', {
          token: token(messages.at(-1)!),
          password: 'replacement-password-2026',
        })
      ).statusCode,
    ).toBe(400)
    const signedIn = await login()
    const cookie = signedIn.cookies.find((c) => c.name === 'slama_owner_session')!.value
    await fixture.client`update platform_users set disabled_at=now() where email=${email}`
    expect((await login()).statusCode).toBe(401)
    expect(
      (
        await app.inject({
          method: 'GET',
          url: '/api/v1/owner-auth/session',
          cookies: { slama_owner_session: cookie },
        })
      ).statusCode,
    ).toBe(401)
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/v1/owner-auth/login',
          payload: { email, password },
        })
      ).statusCode,
    ).toBe(403)
  })

  it('limits owner login attempts and ignores a staff cookie', async () => {
    for (let i = 0; i < 5; i++)
      expect((await post('login', { email, password })).statusCode).toBe(401)
    expect((await post('login', { email, password })).statusCode).toBe(429)
    expect(
      (
        await app.inject({
          method: 'GET',
          url: '/api/v1/owner-auth/session',
          cookies: { slama_session: 'staff-token' },
        })
      ).statusCode,
    ).toBe(401)
  })

  it('rejects another trusted tenant origin for owner endpoints', async () => {
    const result = await app.inject({
      method: 'GET',
      url: '/api/v1/owner-auth/session',
      headers: { origin: 'http://localhost:5174' },
    })
    expect(result.statusCode).toBe(403)
    expect(result.json().code).toBe('UNTRUSTED_ORIGIN')
  })

  it('disables public registration by default without touching the database', async () => {
    const disabled = await buildApp({
      environment: loadEnvironment({ NODE_ENV: 'test' }),
      logger: false,
    })
    try {
      const result = await disabled.inject({
        method: 'POST',
        url: '/api/v1/owner-auth/register',
        headers,
        payload: { email, password, ...names },
      })
      expect(result.statusCode).toBe(503)
      expect(result.json().code).toBe('OWNER_AUTH_UNAVAILABLE')
    } finally {
      await disabled.close()
    }
  })
})
