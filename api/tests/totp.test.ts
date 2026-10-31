import { randomBytes } from 'node:crypto'

import { describe, expect, it } from 'vitest'

import {
  base32Decode,
  base32Encode,
  createSecretBox,
  generateTotpSecret,
  hotp,
  otpauthUri,
  totp,
  verifyTotp,
} from '../src/lib/totp.js'

// RFC 6238 Appendix B (SHA1 seed) and RFC 4226 Appendix D.
const seed = Buffer.from('12345678901234567890', 'ascii')
const rfc6238: [number, string][] = [
  [59, '94287082'],
  [1111111109, '07081804'],
  [1111111111, '14050471'],
  [1234567890, '89005924'],
  [2000000000, '69279037'],
  [20000000000, '65353130'],
]

describe('TOTP (RFC 6238)', () => {
  it.each(rfc6238)('matches the SHA1 test vector at T=%i', (seconds, expected) => {
    expect(totp(seed, seconds * 1000, 8)).toBe(expected)
    expect(totp(seed, seconds * 1000)).toBe(expected.slice(-6))
  })
  it('matches RFC 4226 HOTP vectors', () => {
    expect([0, 1, 2, 9].map((c) => hotp(seed, c))).toEqual(['755224', '287082', '359152', '520489'])
  })
  it('accepts ±1 step only and reports the matched step', () => {
    const now = 1111111111_000
    const step = Math.floor(now / 30_000)
    expect(verifyTotp(seed, totp(seed, now), now)).toBe(step)
    expect(verifyTotp(seed, totp(seed, now - 30_000), now)).toBe(step - 1)
    expect(verifyTotp(seed, totp(seed, now + 30_000), now)).toBe(step + 1)
    expect(verifyTotp(seed, totp(seed, now - 60_000), now)).toBeNull()
    expect(verifyTotp(seed, 'abcdef', now)).toBeNull()
    expect(verifyTotp(seed, '1234567', now)).toBeNull()
  })
  it('round-trips base32 secrets and builds an otpauth URI', () => {
    expect(base32Encode(seed)).toBe('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ')
    expect(base32Decode('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ').equals(seed)).toBe(true)
    const secret = generateTotpSecret()
    expect(secret).toMatch(/^[A-Z2-7]{32}$/)
    const uri = new URL(otpauthUri(secret, 'ops@example.test'))
    expect(uri.protocol).toBe('otpauth:')
    expect(uri.searchParams.get('secret')).toBe(secret)
    expect(uri.searchParams.get('period')).toBe('30')
  })
  it('seals secrets with authenticated encryption', () => {
    const box = createSecretBox(randomBytes(32))
    const sealed = box.seal('SECRET')
    expect(sealed).not.toContain('SECRET')
    expect(box.open(sealed)).toBe('SECRET')
    expect(() => createSecretBox(randomBytes(32)).open(sealed)).toThrow()
    expect(() => box.open(sealed.slice(0, -2) + 'AA')).toThrow()
  })
})
