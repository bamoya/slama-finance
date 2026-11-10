import {
  browserSupportsWebAuthn,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
  startAuthentication,
  startRegistration,
} from '@simplewebauthn/browser'

import type {
  AdminPasskeyAssertionCredential,
  AdminPasskeyChallengeOptionsJSON,
  AdminPasskeyRegistrationCredential,
} from '../../../../../api/generated/models'

/** A browser-side passkey failure with a message that has a French catalog entry. */
export class PasskeyCeremonyError extends Error {
  constructor(
    message: 'Passkey request cancelled.' | 'Passkeys are not supported by this browser.',
    public readonly cancelled: boolean,
  ) {
    super(message)
    this.name = 'PasskeyCeremonyError'
  }
}

function classify(error: unknown): never {
  const name = error instanceof Error ? error.name : ''
  if (name === 'NotAllowedError' || name === 'AbortError')
    throw new PasskeyCeremonyError('Passkey request cancelled.', true)
  if (name === 'NotSupportedError') {
    throw new PasskeyCeremonyError('Passkeys are not supported by this browser.', false)
  }
  throw error
}

/** Thin wrapper over the vetted browser library: it serializes the credential, we only classify failures. */
export function usePasskeyCeremony() {
  const supported = browserSupportsWebAuthn()
  const guard = () => {
    if (!supported)
      throw new PasskeyCeremonyError('Passkeys are not supported by this browser.', false)
  }
  return {
    supported,
    async authenticate(options: AdminPasskeyChallengeOptionsJSON) {
      guard()
      try {
        return (await startAuthentication({
          optionsJSON: options as unknown as PublicKeyCredentialRequestOptionsJSON,
        })) as unknown as AdminPasskeyAssertionCredential
      } catch (error) {
        return classify(error)
      }
    },
    async register(options: AdminPasskeyChallengeOptionsJSON) {
      guard()
      try {
        return (await startRegistration({
          optionsJSON: options as unknown as PublicKeyCredentialCreationOptionsJSON,
        })) as unknown as AdminPasskeyRegistrationCredential
      } catch (error) {
        return classify(error)
      }
    },
  }
}
