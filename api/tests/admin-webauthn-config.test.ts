import { describe, expect, it } from 'vitest'

import { adminWebAuthn, loadEnvironment } from '../src/config/env.js'
import { createRecoveryCodes } from '../src/modules/platform/administration/auth/services/admin-webauthn.service.js'

describe('administrator WebAuthn configuration', () => {
  it('derives the relying party from the admin site, never from requests', () => {
    expect(adminWebAuthn(loadEnvironment({ NODE_ENV: 'test' }))).toEqual({
      origin: 'http://admin.localhost:5173',
      rpId: 'admin.localhost',
    })
    expect(
      adminWebAuthn({
        PLATFORM_DOMAIN: 'bfinance.ma',
        PLATFORM_SCHEME: 'https',
        ADMIN_WEBAUTHN_RP_ID: 'bfinance.ma',
      }),
    ).toEqual({ origin: 'https://admin.bfinance.ma', rpId: 'bfinance.ma' })
  })

  it('rejects an RP ID unrelated to the admin origin and insecure production settings', () => {
    expect(() =>
      loadEnvironment({ NODE_ENV: 'test', ADMIN_WEBAUTHN_RP_ID: 'evil.example' }),
    ).toThrow('ADMIN_WEBAUTHN_RP_ID')
    const production = {
      NODE_ENV: 'production',
      DATABASE_URL: 'postgres://u:p@db:5432/app',
      PLATFORM_SCHEME: 'https',
      PLATFORM_DOMAIN: 'bfinance.ma',
      NOTIFICATION_TRANSPORT: 'resend',
    }
    expect(() =>
      loadEnvironment({ ...production, ADMIN_WEBAUTHN_ORIGIN: 'http://admin.bfinance.ma' }),
    ).toThrow('ADMIN_WEBAUTHN_ORIGIN')
    expect(() =>
      loadEnvironment({
        ...production,
        ADMIN_WEBAUTHN_ORIGIN: 'https://admin.localhost',
        ADMIN_WEBAUTHN_RP_ID: 'localhost',
      }),
    ).toThrow('ADMIN_WEBAUTHN_ORIGIN')
  })

  it('hashes normalized recovery codes with a derived key', () => {
    const codes = createRecoveryCodes(Buffer.alloc(32, 1))
    const other = createRecoveryCodes(Buffer.alloc(32, 2))
    const [code] = codes.generate()
    expect(code).toMatch(/^[A-Z2-7]{4}(-[A-Z2-7]{4}){3}$/)
    expect(codes.hash(code!)).toBe(codes.hash(code!.toLowerCase().replace(/-/g, ' ')))
    expect(codes.hash(code!)).not.toBe(other.hash(code!))
    expect(codes.hash(code!)).not.toContain(code!.replace(/-/g, ''))
  })
})
