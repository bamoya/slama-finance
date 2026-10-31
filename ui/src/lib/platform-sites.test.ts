import { afterEach, describe, expect, it } from 'vitest'

import {
  classifyHost,
  organizationAddress,
  organizationLoginUrl,
  ownerOrigin,
  platformDomain,
  resolvePlatformDomain,
} from './platform-sites'

describe('platform domain configuration', () => {
  afterEach(() => {
    delete window.__SLAMA_CONFIG__
  })
  it('prefers runtime configuration over the build value', () => {
    expect(resolvePlatformDomain('bfinance.ma', 'build.test', true, 'x.test')).toBe('bfinance.ma')
    expect(resolvePlatformDomain('', 'build.test', true, 'x.test')).toBe('build.test')
  })
  it('falls back to localhost in development and the current host in production', () => {
    expect(resolvePlatformDomain(undefined, undefined, false, 'x.test')).toBe('localhost:5173')
    expect(resolvePlatformDomain(undefined, undefined, true, 'X.test')).toBe('x.test')
  })
  it('reads the runtime config from the window', () => {
    window.__SLAMA_CONFIG__ = { platformDomain: 'Example.TEST' }
    expect(platformDomain()).toBe('example.test')
  })
})

describe('host classification', () => {
  it.each([
    ['bfinance.ma', { kind: 'public' }],
    ['www.bfinance.ma', { kind: 'public' }],
    ['app.bfinance.ma', { kind: 'owner' }],
    ['ADMIN.bfinance.ma', { kind: 'admin' }],
    ['acme.bfinance.ma', { kind: 'organization', slug: 'acme' }],
    ['api.bfinance.ma', { kind: 'unknown' }],
    ['mail.bfinance.ma', { kind: 'unknown' }],
    ['xn--abc.bfinance.ma', { kind: 'unknown' }],
    ['a.b.bfinance.ma', { kind: 'unknown' }],
    ['ab.bfinance.ma', { kind: 'unknown' }],
    ['evil.com', { kind: 'unknown' }],
    ['bfinance.ma.evil.com', { kind: 'unknown' }],
    ['notbfinance.ma', { kind: 'unknown' }],
  ])('%s', (host, expected) => {
    expect(classifyHost(host, 'bfinance.ma')).toEqual(expected)
  })
  it('includes the development port', () => {
    expect(classifyHost('localhost:5173', 'localhost:5173')).toEqual({ kind: 'public' })
    expect(classifyHost('admin.localhost:5173', 'localhost:5173')).toEqual({ kind: 'admin' })
    expect(classifyHost('acme.localhost:5173', 'localhost:5173')).toEqual({
      kind: 'organization',
      slug: 'acme',
    })
    expect(classifyHost('acme.localhost:3000', 'localhost:5173')).toEqual({ kind: 'unknown' })
  })
})

describe('cross-site links', () => {
  it('build origins from the platform domain and current scheme', () => {
    window.__SLAMA_CONFIG__ = { platformDomain: 'bfinance.ma' }
    expect(ownerOrigin()).toBe(`${window.location.protocol}//app.bfinance.ma`)
    expect(organizationLoginUrl('acme')).toBe(`${window.location.protocol}//acme.bfinance.ma/login`)
    expect(organizationAddress('acme')).toBe('acme.bfinance.ma')
    delete window.__SLAMA_CONFIG__
  })
})
