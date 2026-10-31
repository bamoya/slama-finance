import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto'

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
export const TOTP_PERIOD_SECONDS = 30

export function base32Encode(data: Buffer) {
  let bits = 0,
    value = 0,
    output = ''
  for (const byte of data) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      output += ALPHABET[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) output += ALPHABET[(value << (5 - bits)) & 31]
  return output
}

export function base32Decode(input: string) {
  const clean = input.replace(/=+$/, '').replace(/\s/g, '').toUpperCase()
  let bits = 0,
    value = 0
  const bytes: number[] = []
  for (const char of clean) {
    const index = ALPHABET.indexOf(char)
    if (index < 0) throw new Error('Invalid base32 secret')
    value = (value << 5) | index
    bits += 5
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255)
      bits -= 8
    }
  }
  return Buffer.from(bytes)
}

/** RFC 4226 HOTP with HMAC-SHA1 and dynamic truncation. */
export function hotp(key: Buffer, counter: number, digits = 6) {
  const message = Buffer.alloc(8)
  message.writeBigUInt64BE(BigInt(counter))
  const digest = createHmac('sha1', key).update(message).digest()
  const offset = digest[digest.length - 1]! & 0x0f
  const binary = digest.readUInt32BE(offset) & 0x7fffffff
  return String(binary % 10 ** digits).padStart(digits, '0')
}

export const totpStep = (now: Date | number) => Math.floor(Number(now) / 1000 / TOTP_PERIOD_SECONDS)

/** RFC 6238 TOTP code for a time (30-second steps, T0 = 0). */
export const totp = (key: Buffer, now: Date | number, digits = 6) =>
  hotp(key, totpStep(now), digits)

/**
 * Returns the matched time step within ±window steps, or null. Callers must reject steps at or
 * before the last accepted one to prevent replay.
 */
export function verifyTotp(key: Buffer, code: string, now: Date | number, window = 1) {
  if (!/^\d{6}$/.test(code)) return null
  const current = totpStep(now)
  let matched: number | null = null
  for (let step = current - window; step <= current + window; step++) {
    // Compare every candidate in constant time; never short-circuit on the first match.
    if (timingSafeEqual(Buffer.from(hotp(key, step)), Buffer.from(code))) matched ??= step
  }
  return matched
}

export const generateTotpSecret = () => base32Encode(randomBytes(20))

export function otpauthUri(secret: string, account: string, issuer = 'Slama Admin') {
  const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(account)}`
  const query = new URLSearchParams({
    secret,
    issuer,
    algorithm: 'SHA1',
    digits: '6',
    period: String(TOTP_PERIOD_SECONDS),
  })
  return `otpauth://totp/${label}?${query.toString()}`
}

/** AES-256-GCM envelope for TOTP secrets at rest: v1.<iv>.<tag>.<ciphertext> (base64url). */
export function createSecretBox(key: Buffer) {
  if (key.length !== 32) throw new Error('The TOTP encryption key must be 32 bytes')
  return {
    seal(plain: string) {
      const iv = randomBytes(12)
      const cipher = createCipheriv('aes-256-gcm', key, iv)
      const body = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
      return ['v1', ...[iv, cipher.getAuthTag(), body].map((p) => p.toString('base64url'))].join(
        '.',
      )
    },
    open(sealed: string) {
      const [version, iv, tag, body] = sealed.split('.')
      if (version !== 'v1' || !iv || !tag || !body) throw new Error('Unsupported TOTP envelope')
      const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'))
      decipher.setAuthTag(Buffer.from(tag, 'base64url'))
      return Buffer.concat([
        decipher.update(Buffer.from(body, 'base64url')),
        decipher.final(),
      ]).toString('utf8')
    },
  }
}
