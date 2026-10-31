import { afterEach, describe, expect, it } from 'vitest'

import { joinOrigin, resolveLegacyRedirect } from './legacy-redirects'

const id = '33333333-3333-4333-8333-333333333333'
const origin = (url: string) => ({ kind: 'origin', url })

describe('legacy redirects', () => {
  afterEach(() => {
    delete window.__SLAMA_CONFIG__
  })
  it('looks up the organization address for old /organizations/<id>/… links on any host', () => {
    for (const kind of ['public', 'admin', 'unknown'] as const)
      expect(resolveLegacyRedirect({ kind }, `/organizations/${id}/login`)).toEqual({
        kind: 'lookup',
        organizationId: id,
        rest: '/login',
      })
    expect(
      resolveLegacyRedirect({ kind: 'organization', slug: 'acme' }, `/organizations/${id}`),
    ).toEqual({ kind: 'lookup', organizationId: id, rest: '' })
    expect(
      resolveLegacyRedirect(
        { kind: 'public' },
        `/organizations/${id.toUpperCase()}/workspace/dashboard`,
      ),
    ).toMatchObject({ organizationId: id, rest: '/workspace/dashboard' })
  })
  it('keeps owner pages that share the /organizations/<id> shape', () => {
    expect(resolveLegacyRedirect({ kind: 'owner' }, `/organizations/${id}`)).toBeNull()
    expect(resolveLegacyRedirect({ kind: 'owner' }, `/organizations/${id}/setup`)).toBeNull()
    expect(resolveLegacyRedirect({ kind: 'owner' }, `/organizations/${id}/login`)).toMatchObject({
      kind: 'lookup',
    })
  })
  it('moves /admin and /owner prefixes to their sites without the prefix', () => {
    window.__SLAMA_CONFIG__ = { platformDomain: 'bfinance.ma' }
    const scheme = window.location.protocol
    expect(resolveLegacyRedirect({ kind: 'public' }, '/admin')).toEqual(
      origin(`${scheme}//admin.bfinance.ma/`),
    )
    expect(resolveLegacyRedirect({ kind: 'public' }, '/admin/customers/abc')).toEqual(
      origin(`${scheme}//admin.bfinance.ma/customers/abc`),
    )
    expect(resolveLegacyRedirect({ kind: 'organization', slug: 'acme' }, '/owner/login')).toEqual(
      origin(`${scheme}//app.bfinance.ma/login`),
    )
    expect(resolveLegacyRedirect({ kind: 'public' }, '/auth/register')).toEqual(
      origin(`${scheme}//app.bfinance.ma/register`),
    )
    expect(resolveLegacyRedirect({ kind: 'admin' }, '/admin/login')).toBeNull()
    expect(resolveLegacyRedirect({ kind: 'owner' }, '/owner')).toBeNull()
  })
  it('leaves current addresses alone', () => {
    expect(resolveLegacyRedirect({ kind: 'public' }, '/tarifs')).toBeNull()
    expect(
      resolveLegacyRedirect({ kind: 'organization', slug: 'acme' }, '/workspace/dashboard'),
    ).toBeNull()
    expect(resolveLegacyRedirect({ kind: 'owner' }, '/organizations')).toBeNull()
  })
  it('joins the API origin with the preserved path', () => {
    expect(joinOrigin('https://acme.bfinance.ma/', '/workspace/x', '?a=1#t')).toBe(
      'https://acme.bfinance.ma/workspace/x?a=1#t',
    )
    expect(joinOrigin('https://acme.bfinance.ma', '', '')).toBe('https://acme.bfinance.ma/')
  })
})
