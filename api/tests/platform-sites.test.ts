import { afterEach, describe, expect, it } from 'vitest'

import { buildApp } from '../src/app.js'
import { loadEnvironment } from '../src/config/env.js'
import { createPlatformSites, slugProblem } from '../src/lib/platform-sites.js'

const organizationId = '10000000-0000-4000-8000-000000000001'
const apps: Awaited<ReturnType<typeof buildApp>>[] = []
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()))
})
async function appFor(overrides: NodeJS.ProcessEnv = {}) {
  const app = await buildApp({
    environment: loadEnvironment({ NODE_ENV: 'test', ...overrides }),
    logger: false,
    organizationBySlug: async (slug) => (slug === 'acme' ? { id: organizationId } : undefined),
  })
  apps.push(app)
  return app
}

describe('platform sites', () => {
  it('classifies production and development hosts', () => {
    const production = createPlatformSites('bfinance.ma', 'https')
    const table: [string | undefined, unknown][] = [
      ['bfinance.ma', { kind: 'public' }],
      ['www.bfinance.ma', { kind: 'public' }],
      ['BFINANCE.MA.', { kind: 'public' }],
      ['app.bfinance.ma', { kind: 'owner' }],
      ['admin.bfinance.ma', { kind: 'admin' }],
      ['api.bfinance.ma', { kind: 'api' }],
      ['acme.bfinance.ma', { kind: 'organization', slug: 'acme' }],
      ['ACME.bfinance.ma', { kind: 'organization', slug: 'acme' }],
      ['support.bfinance.ma', { kind: 'unknown' }],
      ['xn--acme.bfinance.ma', { kind: 'unknown' }],
      ['ab.bfinance.ma', { kind: 'unknown' }],
      ['-acme.bfinance.ma', { kind: 'unknown' }],
      ['a.b.bfinance.ma', { kind: 'unknown' }],
      ['evilbfinance.ma', { kind: 'unknown' }],
      ['acme.bfinance.ma.evil.test', { kind: 'unknown' }],
      ['bfinance.ma:8080', { kind: 'unknown' }],
      ['', { kind: 'unknown' }],
      [undefined, { kind: 'unknown' }],
    ]
    for (const [host, site] of table) expect(production.classify(host), String(host)).toEqual(site)
    const development = createPlatformSites('localhost:5173', 'http')
    expect(development.classify('localhost:5173')).toEqual({ kind: 'public' })
    expect(development.classify('acme.localhost:5173')).toEqual({
      kind: 'organization',
      slug: 'acme',
    })
    expect(development.classify('acme.localhost:3000')).toEqual({ kind: 'unknown' })
    expect(production.origins).toEqual({
      public: 'https://bfinance.ma',
      owner: 'https://app.bfinance.ma',
      admin: 'https://admin.bfinance.ma',
      api: 'https://api.bfinance.ma',
    })
    expect(production.organizationOrigin('acme')).toBe('https://acme.bfinance.ma')
    expect(production.secureCookies).toBe(true)
    expect(development.secureCookies).toBe(false)
  })

  it('applies slug rules', () => {
    for (const slug of ['abc', 'acme-2026', 'a'.repeat(40), 'a-b'])
      expect(slugProblem(slug), slug).toBeNull()
    for (const slug of ['ab', 'a'.repeat(41), 'Acme', 'acme_x', '-acme', 'acme-', 'acmé', 'a.b'])
      expect(slugProblem(slug), slug).toBe('SLUG_INVALID')
    for (const slug of ['app', 'admin', 'api', 'www', 'billing', 'auth', 'xn--abc'])
      expect(slugProblem(slug), slug).toBe('SLUG_RESERVED')
  })

  it('validates the platform configuration', () => {
    expect(loadEnvironment({}).PLATFORM_DOMAIN).toBe('localhost:5173')
    expect(loadEnvironment({}).PLATFORM_SCHEME).toBe('http')
    expect(loadEnvironment({ PLATFORM_DOMAIN: 'BFinance.ma' }).PLATFORM_DOMAIN).toBe('bfinance.ma')
    for (const value of ['https://bfinance.ma', 'bfinance.ma/', '*.bfinance.ma', 'b finance.ma'])
      expect(() => loadEnvironment({ PLATFORM_DOMAIN: value })).toThrow('PLATFORM_DOMAIN')
    expect(() => loadEnvironment({ NODE_ENV: 'production' })).toThrow('PLATFORM_SCHEME')
  })
})

describe('host guards', () => {
  const groups = {
    owner: '/api/v1/owner-auth/session',
    admin: '/api/v1/admin/auth/me',
    organization: '/api/v1/organization-auth/session',
  }
  const hosts = {
    public: 'localhost:5173',
    owner: 'app.localhost:5173',
    admin: 'admin.localhost:5173',
    api: 'api.localhost:5173',
    organization: 'acme.localhost:5173',
    unknown: 'other.example:5173',
  }

  it('returns 404 for every route group served on another kind of site', async () => {
    const app = await appFor()
    for (const [group, url] of Object.entries(groups))
      for (const [kind, host] of Object.entries(hosts)) {
        if (kind === group) continue
        const response = await app.inject({ url, headers: { host } })
        expect(response.statusCode, `${group} on ${kind}`).toBe(404)
        expect(response.json().code).toBe('NOT_FOUND')
      }
    for (const host of Object.values(hosts)) {
      expect((await app.inject({ url: '/health', headers: { host } })).statusCode).toBe(200)
      expect((await app.inject({ url: '/api/v1/health', headers: { host } })).statusCode).toBe(200)
    }
  })

  it('returns 404 without leaking for unknown, reserved and invalid organization hosts', async () => {
    const app = await appFor()
    for (const host of ['missing.localhost:5173', 'support.localhost:5173', 'ab.localhost:5173']) {
      const response = await app.inject({ url: groups.organization, headers: { host } })
      expect(response.statusCode, host).toBe(404)
      expect(response.json()).toMatchObject({ code: 'NOT_FOUND' })
    }
  })

  it('ignores X-Forwarded-Host from untrusted sockets and honours it from a trusted proxy', async () => {
    const untrusted = await appFor()
    const spoofed = await untrusted.inject({
      url: '/api/v1/admin/auth/me',
      remoteAddress: '198.51.100.7',
      headers: { host: 'acme.localhost:5173', 'x-forwarded-host': 'admin.localhost:5173' },
    })
    expect(spoofed.statusCode).toBe(404)
    const trusted = await appFor({ TRUST_PROXY_IPS: '10.0.0.10' })
    const spoofedPeer = await trusted.inject({
      url: '/api/v1/admin/auth/me',
      remoteAddress: '198.51.100.7',
      headers: { host: 'acme.localhost:5173', 'x-forwarded-host': 'admin.localhost:5173' },
    })
    expect(spoofedPeer.statusCode).toBe(404)
    const proxied = await trusted.inject({
      url: '/api/v1/admin/auth/me',
      remoteAddress: '10.0.0.10',
      headers: { host: 'api-internal:3000', 'x-forwarded-host': 'admin.localhost:5173' },
    })
    expect(proxied.statusCode).not.toBe(404)
  })

  it('requires same-site origins for mutations and grants no CORS', async () => {
    const app = await appFor()
    const logout = (origin?: string) =>
      app.inject({
        method: 'POST',
        url: '/api/v1/auth/logout',
        headers: { host: 'acme.localhost:5173', ...(origin ? { origin } : {}) },
      })
    for (const origin of [
      undefined,
      'http://app.localhost:5173',
      'http://other.localhost:5173',
      'https://acme.localhost:5173',
    ]) {
      const response = await logout(origin)
      expect(response.statusCode, origin).toBe(403)
      expect(response.json().code).toBe('UNTRUSTED_ORIGIN')
    }
    const accepted = await logout('http://acme.localhost:5173')
    expect(accepted.statusCode).toBe(204)
    expect(accepted.headers['access-control-allow-origin']).toBeUndefined()
  })

  it('clears cookies host-only on an HTTPS platform', async () => {
    const app = await appFor({ PLATFORM_DOMAIN: 'bfinance.test', PLATFORM_SCHEME: 'https' })
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout',
      headers: { host: 'acme.bfinance.test', origin: 'https://acme.bfinance.test' },
    })
    expect(response.statusCode).toBe(204)
    expect(response.cookies.length).toBeGreaterThan(0)
    for (const cookie of response.cookies) {
      expect(cookie.domain).toBeUndefined()
    }
  })
})
