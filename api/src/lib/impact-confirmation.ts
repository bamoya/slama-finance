import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

import { AppError } from './errors.js'

/** Process-local signing key: restarting the API deliberately invalidates old previews. */
export function createImpactConfirmation() {
  const secret = randomBytes(32)
  const sign = (value: string) => createHmac('sha256', secret).update(value).digest('hex')
  const digest = (value: unknown) =>
    createHash('sha256').update(JSON.stringify(value)).digest('hex')
  return {
    issue(value: unknown) {
      const expires = Date.now() + 5 * 60_000
      const payload = `${expires}.${digest(value)}`
      return { token: `${payload}.${sign(payload)}`, expiresAt: new Date(expires).toISOString() }
    },
    assert(token: string, value: unknown) {
      const [expires, fingerprint, signature, extra] = token.split('.')
      const payload = `${expires}.${fingerprint}`
      const expected = Buffer.from(sign(payload))
      const actual = Buffer.from(signature ?? '')
      if (
        extra !== undefined ||
        !expires ||
        !/^\d+$/.test(expires) ||
        Number(expires) <= Date.now() ||
        fingerprint !== digest(value) ||
        actual.length !== expected.length ||
        !timingSafeEqual(actual, expected)
      )
        throw new AppError(409, 'IMPACT_CHANGED', 'The impact changed or expired. Review it again.')
    },
  }
}
