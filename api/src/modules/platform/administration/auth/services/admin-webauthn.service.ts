import { createHmac, hkdfSync, randomBytes } from 'node:crypto'

import {
  type AuthenticationResponseJSON,
  generateAuthenticationOptions,
  generateRegistrationOptions,
  type RegistrationResponseJSON,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server'

import { base32Encode } from '../../../../../lib/totp.js'
import type { PasskeyRow } from '../repositories/admin-credential.repository.js'

export const CHALLENGE_MINUTES = 5
export const RECOVERY_CODE_COUNT = 10

/** Relying party from server configuration only; request headers never choose it. */
export type AdminWebAuthnConfig = { rpId: string; origin: string; rpName: string }

/** WebAuthn user handle: the administrator id as 16 raw bytes. */
const userId = (adminId: string) => new Uint8Array(Buffer.from(adminId.replace(/-/g, ''), 'hex'))
export const userHandleOf = (adminId: string) => Buffer.from(userId(adminId)).toString('base64url')

/**
 * Thin adapter over @simplewebauthn/server. Every verification requires user verification and
 * checks the configured origin, RP ID and stored challenge; any library error is a failed check.
 */
export function createAdminWebAuthn(config: AdminWebAuthnConfig) {
  const timeout = CHALLENGE_MINUTES * 60_000
  return {
    loginOptions: () =>
      generateAuthenticationOptions({ rpID: config.rpId, userVerification: 'required', timeout }),
    reauthOptions: (passkeys: PasskeyRow[]) =>
      generateAuthenticationOptions({
        rpID: config.rpId,
        userVerification: 'required',
        timeout,
        allowCredentials: passkeys.map((p) => ({ id: p.credentialId, transports: p.transports })),
      }),
    registrationOptions: (
      admin: { id: string; email: string; name: string },
      existing: PasskeyRow[],
    ) =>
      generateRegistrationOptions({
        rpName: config.rpName,
        rpID: config.rpId,
        userName: admin.email,
        userDisplayName: admin.name,
        userID: userId(admin.id),
        timeout,
        attestationType: 'none',
        excludeCredentials: existing.map((p) => ({
          id: p.credentialId,
          transports: p.transports,
        })),
        authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
      }),
    async verifyAssertion(
      response: Record<string, unknown>,
      challenge: string,
      passkey: PasskeyRow,
    ) {
      try {
        const result = await verifyAuthenticationResponse({
          response: response as unknown as AuthenticationResponseJSON,
          expectedChallenge: challenge,
          expectedOrigin: config.origin,
          expectedRPID: config.rpId,
          requireUserVerification: true,
          credential: {
            id: passkey.credentialId,
            publicKey: passkey.publicKey,
            counter: passkey.counter,
            transports: passkey.transports,
          },
        })
        if (!result.verified || !result.authenticationInfo.userVerified) return null
        return {
          counter: result.authenticationInfo.newCounter,
          backedUp: result.authenticationInfo.credentialBackedUp,
        }
      } catch {
        return null
      }
    },
    async verifyRegistration(response: Record<string, unknown>, challenge: string) {
      try {
        const result = await verifyRegistrationResponse({
          response: response as unknown as RegistrationResponseJSON,
          expectedChallenge: challenge,
          expectedOrigin: config.origin,
          expectedRPID: config.rpId,
          requireUserVerification: true,
        })
        if (!result.verified || !result.registrationInfo.userVerified) return null
        return result.registrationInfo
      } catch {
        return null
      }
    },
  }
}

export type AdminWebAuthn = ReturnType<typeof createAdminWebAuthn>

/** The credential id and user handle claimed by an untrusted assertion, if well formed. */
export function assertionClaims(response: Record<string, unknown>) {
  const inner = response.response as Record<string, unknown> | undefined
  return {
    credentialId: typeof response.id === 'string' ? response.id : null,
    userHandle: typeof inner?.userHandle === 'string' ? inner.userHandle : null,
  }
}

/**
 * Recovery codes: 80 random bits shown as XXXX-XXXX-XXXX-XXXX (base32). Only an HMAC-SHA-256
 * digest under a key derived from the administrator secret key is stored.
 */
export function createRecoveryCodes(secretKey: Buffer) {
  const key = Buffer.from(hkdfSync('sha256', secretKey, '', 'slama-admin-recovery-codes', 32))
  const normalize = (code: string) => code.toUpperCase().replace(/[-\s]/g, '')
  return {
    hash: (code: string) => createHmac('sha256', key).update(normalize(code)).digest('hex'),
    generate: () =>
      Array.from({ length: RECOVERY_CODE_COUNT }, () =>
        (base32Encode(randomBytes(10)).match(/.{4}/g) ?? []).join('-'),
      ),
  }
}
