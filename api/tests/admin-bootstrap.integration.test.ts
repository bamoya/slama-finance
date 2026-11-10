import { randomBytes, randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'

import postgres from 'postgres'
import { afterEach, describe, expect, it } from 'vitest'

import { bootstrapAdmin } from '../scripts/bootstrap-admin.js'
// @ts-expect-error -- untyped JavaScript deployment initializer, exercised as shipped.
import { initializeDatabase } from '../scripts/initialize-database.mjs'
import { buildApp } from '../src/app.js'
import { loadEnvironment } from '../src/config/env.js'
import { createPasswordService } from '../src/lib/password.js'
import { base32Decode, totp } from '../src/lib/totp.js'
import {
  adminBootstrapConfig,
  createAdminAccounts,
} from '../src/modules/platform/administration/index.js'
import { attachTestDatabase, isolatedDatabase } from './helpers/postgres.js'

const password = 'first-deploy-password-2026'

describe('deployment administrator configuration', () => {
  it('requires both credentials or neither, and validates them without echoing values', () => {
    expect(adminBootstrapConfig({})).toBeNull()
    expect(adminBootstrapConfig({ ADMIN_EMAIL: '  ', ADMIN_PASSWORD: '' })).toBeNull()
    expect(() => adminBootstrapConfig({ ADMIN_EMAIL: 'ops@example.test' })).toThrow(
      'Set both ADMIN_EMAIL and ADMIN_PASSWORD, or neither.',
    )
    expect(() => adminBootstrapConfig({ ADMIN_PASSWORD: password })).toThrow(/both/)
    for (const email of ['not-an-email', 'a@b', 'two words@example.test'])
      expect(() => adminBootstrapConfig({ ADMIN_EMAIL: email, ADMIN_PASSWORD: password })).toThrow(
        'ADMIN_EMAIL is not a valid email.',
      )
    let error: unknown
    try {
      adminBootstrapConfig({ ADMIN_EMAIL: 'ops@example.test', ADMIN_PASSWORD: 'short-pass' })
    } catch (caught) {
      error = caught
    }
    expect(String((error as Error).message)).not.toContain('short-pass')
    expect(
      adminBootstrapConfig({ ADMIN_EMAIL: ' Ops@Example.TEST ', ADMIN_PASSWORD: password }),
    ).toEqual({ email: 'ops@example.test', name: 'Administrator', password })
  })

  it('runs in the deployment migrate step from the release image', async () => {
    const compose = await readFile(
      new URL('../../infra/compose/docker-compose.dokploy.yml', import.meta.url),
      'utf8',
    )
    const migrate = compose.slice(compose.indexOf('\n  migrate:'))
    expect(migrate).toContain(
      'node scripts/initialize-database.mjs && node --import tsx scripts/bootstrap-admin.ts',
    )
    for (const variable of ['ADMIN_EMAIL', 'ADMIN_PASSWORD', 'ADMIN_NAME'])
      expect(migrate).toContain(`${variable}: \${${variable}:-}`)
    // The API service never receives the bootstrap password.
    expect(compose.slice(0, compose.indexOf('\n  migrate:'))).not.toContain('ADMIN_PASSWORD')
    // The release target is the full build stage: scripts, sources and tsx are present.
    const dockerfile = await readFile(new URL('../Dockerfile', import.meta.url), 'utf8')
    expect(dockerfile).toMatch(/FROM build AS release\nUSER node/)
    expect(dockerfile).toContain('COPY api ./api')
    const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
    expect(manifest.devDependencies.tsx ?? manifest.dependencies.tsx).toBeTruthy()
  })
})

describe('deployment administrator bootstrap on a fresh database', () => {
  it('creates one hashed, audited administrator across concurrent and repeated runs', async () => {
    const value = process.env.TEST_DATABASE_URL
    if (!value) throw new Error('TEST_DATABASE_URL is required')
    const url = new URL(value)
    if (!['localhost', '127.0.0.1'].includes(url.hostname) || !url.pathname.endsWith('_test'))
      throw new Error('Dedicated local test database required')
    const suffix = randomUUID().replaceAll('-', '')
    const database = `bootstrap_test_${suffix}`
    const role = `bootstrap_role_${suffix}`
    const server = postgres(value, { max: 1, onnotice: () => {} })
    let owner: postgres.Sql | undefined
    try {
      await server.unsafe(`CREATE DATABASE "${database}"`)
      url.pathname = `/${database}`
      const ownerUrl = url.toString()
      url.username = role
      url.password = 'bootstrap_runtime_password'
      const env = {
        MIGRATION_DATABASE_URL: ownerUrl,
        DATABASE_URL: url.toString(),
        ADMIN_EMAIL: 'Founder@Example.TEST',
        ADMIN_PASSWORD: password,
        ADMIN_NAME: 'Founder',
      }
      await initializeDatabase(env)
      owner = postgres(ownerUrl, { max: 1, onnotice: () => {} })
      const outcomes = await Promise.all([1, 2, 3].map(() => bootstrapAdmin(env)))
      expect(outcomes.sort()).toEqual(['created', 'existing', 'existing'])
      const admins = await owner`select * from platform_admins`
      expect(admins).toHaveLength(1)
      expect(admins[0]).toMatchObject({ email: 'founder@example.test', name: 'Founder' })
      expect(admins[0]!.password_hash).not.toContain(password)
      expect(await createPasswordService().verify(password, admins[0]!.password_hash)).toBe(true)
      const audit =
        await owner`select actor, action, target_id from platform_admin_audit where action like 'admin.%'`
      expect(audit).toEqual([
        { actor: 'deployment', action: 'admin.create', target_id: admins[0]!.id },
      ])
      // Restart with rotated env values: the existing account is untouched.
      expect(
        await bootstrapAdmin({ ...env, ADMIN_PASSWORD: 'rotated-password-2027', ADMIN_NAME: 'X' }),
      ).toBe('existing')
      expect(await owner`select * from platform_admins`).toEqual(admins)
      expect(
        await owner`select count(*)::int n from platform_admin_audit where action like 'admin.%'`,
      ).toEqual([{ n: 1 }])
      // Unset credentials skip without touching the database; partial ones fail.
      expect(await bootstrapAdmin({ MIGRATION_DATABASE_URL: ownerUrl })).toBe('skipped')
      await expect(
        bootstrapAdmin({ MIGRATION_DATABASE_URL: ownerUrl, ADMIN_EMAIL: 'other@example.test' }),
      ).rejects.toThrow(/both/)
      expect(await owner`select count(*)::int n from platform_admins`).toEqual([{ n: 1 }])
    } finally {
      await owner?.end({ timeout: 2 })
      await server.unsafe(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`)
      await server.unsafe(`DROP ROLE IF EXISTS "${role}"`)
      await server.end({ timeout: 2 })
    }
  })
})

describe('deployment administrator bootstrap with an existing administrator', () => {
  let fixture: Awaited<ReturnType<typeof isolatedDatabase>> | undefined
  let app: Awaited<ReturnType<typeof buildApp>> | undefined
  afterEach(async () => {
    await app?.close()
    await fixture?.cleanup()
  })

  it('signs in through the normal flow and later runs never restore or rotate anything', async () => {
    fixture = await isolatedDatabase({ owner: 'trial' })
    const origin = 'http://localhost:5173'
    app = await buildApp({
      environment: loadEnvironment({
        NODE_ENV: 'test',
        OWNER_AUTH_ENABLED: 'true',
        OWNER_PORTAL_ORIGIN: origin,
        CORS_ORIGIN: origin,
        ADMIN_TOTP_KEY: randomBytes(32).toString('base64'),
      }),
      logger: false,
    })
    attachTestDatabase(app, fixture)
    const accounts = createAdminAccounts(() => fixture!.db)
    const config = adminBootstrapConfig({
      ADMIN_EMAIL: 'ops@example.test',
      ADMIN_PASSWORD: password,
    })!
    expect(await accounts.ensure(config)).toEqual({ created: true })

    // First sign-in: password, then TOTP enrollment, exactly as for CLI-created accounts.
    const login = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/auth/login',
      headers: { origin },
      payload: { email: 'ops@example.test', password },
    })
    expect(login.statusCode, login.body).toBe(200)
    const pending = login.cookies.find((c) => c.name === 'slama_admin_session')!.value
    const key = base32Decode(login.json().enrollment.secret)
    const verified = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/auth/2fa',
      headers: { origin },
      cookies: { slama_admin_session: pending },
      payload: { code: totp(key, Date.now()) },
    })
    expect(verified.statusCode, verified.body).toBe(200)

    await accounts.disable('ops@example.test')
    const before = {
      admins: await fixture.client`select * from platform_admins`,
      sessions: await fixture.client`select * from platform_admin_sessions order by id`,
      audit: await fixture.client`select count(*)::int n from platform_admin_audit`,
    }
    expect(before.admins[0]!.disabled_at).not.toBeNull()
    expect(before.admins[0]!.totp_enrolled_at).not.toBeNull()

    expect(
      await accounts.ensure({ ...config, password: 'changed-env-password-2027', name: 'Renamed' }),
    ).toEqual({ created: false })
    expect({
      admins: await fixture.client`select * from platform_admins`,
      sessions: await fixture.client`select * from platform_admin_sessions order by id`,
      audit: await fixture.client`select count(*)::int n from platform_admin_audit`,
    }).toEqual(before)
    // The operator CLI still manages bootstrap-created accounts.
    await expect(accounts.reset2fa('ops@example.test')).resolves.toMatchObject({
      totpEnrolled: false,
    })
  })
})
