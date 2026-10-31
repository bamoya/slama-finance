import { createHash, randomBytes } from 'node:crypto'

import type { OwnerRegister } from '../../../../contracts/generated/identity/owner-auth.schemas.js'
import type { OwnerAccountDelivery } from '../../../../integrations/contracts.js'
import { AppError } from '../../../../lib/errors.js'
import type { createPasswordService } from '../../../../lib/password.js'
import type { createOwnerAuthRepository } from '../repositories/owner-auth.repository.js'

const hash = (value: string) => createHash('sha256').update(value).digest('hex')
// Valid scrypt shape to keep unknown-user password verification expensive too.
const dummyHash = `${'0'.repeat(32)}:${'0'.repeat(128)}`
const normalize = (email: string) => email.trim().toLowerCase()
const invalidInvitation = () =>
  new AppError(400, 'INVALID_INVITATION_TOKEN', 'This invitation link is invalid or has expired.')
export function createOwnerAuthService(
  repository: ReturnType<typeof createOwnerAuthRepository>,
  passwords: ReturnType<typeof createPasswordService>,
  options: {
    enabled: boolean
    ttlDays: number
    delivery?: OwnerAccountDelivery
    portalOrigin?: string
  },
) {
  function enabled() {
    if (!options.enabled)
      throw new AppError(503, 'OWNER_AUTH_UNAVAILABLE', 'Owner authentication is not enabled.')
  }
  function emailAvailable() {
    enabled()
    if (!options.delivery || !options.portalOrigin)
      throw new AppError(503, 'EMAIL_UNAVAILABLE', 'Owner account email is not configured.')
  }
  async function sendToken(email: string, purpose: 'verify_email' | 'reset_password') {
    emailAvailable()
    const token = randomBytes(32).toString('base64url')
    const tokenHash = hash(token)
    const expiresAt = new Date(Date.now() + (purpose === 'verify_email' ? 24 * 60 : 15) * 60_000)
    const owner = await repository.issueToken(normalize(email), purpose, tokenHash, expiresAt)
    if (!owner) return
    const url = new URL(
      purpose === 'verify_email' ? '/auth/verify-email' : '/auth/reset-password',
      options.portalOrigin,
    )
    url.hash = new URLSearchParams({ token }).toString()
    try {
      await options.delivery!.send({
        to: owner.email,
        url: url.toString(),
        purpose,
        expiresAt,
        language: owner.locale,
      })
    } catch {
      await repository.invalidateToken(tokenHash)
      // Generic public response, including transport failures: never disclose account existence.
    }
  }
  return {
    async register(input: OwnerRegister) {
      emailAvailable()
      const firstName = input.firstName.trim()
      const lastName = input.lastName.trim()
      if (!firstName || !lastName)
        throw new AppError(400, 'VALIDATION_ERROR', 'First and last names are required.')
      await repository.register({
        email: normalize(input.email),
        passwordHash: await passwords.hash(input.password),
        firstName,
        lastName,
        locale: input.locale,
      })
      await sendToken(input.email, 'verify_email')
    },
    requestVerification: (email: string) => sendToken(email, 'verify_email'),
    requestReset: (email: string) => sendToken(email, 'reset_password'),
    async verify(token: string) {
      enabled()
      if (!(await repository.consumeToken(hash(token), 'verify_email')))
        throw new AppError(
          400,
          'INVALID_VERIFICATION_TOKEN',
          'This verification link is invalid or has expired.',
        )
    },
    async reset(token: string, password: string) {
      enabled()
      if (
        !(await repository.consumeToken(
          hash(token),
          'reset_password',
          await passwords.hash(password),
        ))
      )
        throw new AppError(400, 'INVALID_RESET_TOKEN', 'This reset link is invalid or has expired.')
    },
    async inspectInvitation(token: string) {
      enabled()
      const owner = await repository.invitation(hash(token))
      if (!owner) throw invalidInvitation()
      return {
        email: owner.email,
        firstName: owner.firstName,
        lastName: owner.lastName,
        locale: owner.locale,
      }
    },
    async acceptInvitation(token: string, password: string) {
      enabled()
      if (!(await repository.invitation(hash(token)))) throw invalidInvitation()
      if (
        !(await repository.consumeToken(hash(token), 'invitation', await passwords.hash(password)))
      )
        throw invalidInvitation()
    },
    async login(email: string, password: string) {
      enabled()
      const owner = await repository.byEmail(normalize(email))
      const valid = await passwords.verify(password, owner?.passwordHash ?? dummyHash)
      // Blocked or deleting customers get the same response as wrong credentials.
      if (!owner || !valid || owner.disabledAt || owner.blockedAt || owner.deletionRequestedAt)
        throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password.')
      if (!owner.emailVerifiedAt)
        throw new AppError(
          403,
          'EMAIL_VERIFICATION_REQUIRED',
          'Verify your email before signing in.',
        )
      const token = randomBytes(32).toString('base64url')
      const maxAge = options.ttlDays * 86_400
      if (
        !(await repository.issueSession(
          owner.id,
          owner.passwordHash,
          hash(token),
          new Date(Date.now() + maxAge * 1000),
        ))
      )
        throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password.')
      return { owner, token, maxAge }
    },
    async session(token?: string) {
      enabled()
      const owner = token ? await repository.session(hash(token)) : undefined
      if (!owner) throw new AppError(401, 'UNAUTHENTICATED', 'Sign in to your owner account.')
      return owner
    },
    async logout(token?: string) {
      enabled()
      if (token) await repository.revoke(hash(token))
    },
  }
}
