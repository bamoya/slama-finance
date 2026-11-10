import { createHash, generateKeyPairSync, type KeyObject, randomBytes, sign } from 'node:crypto'

/**
 * Software authenticator for tests: produces genuinely signed ES256 WebAuthn registration and
 * assertion responses. It only builds fixtures; the API verifies them with @simplewebauthn/server.
 */
const b64 = (data: Buffer) => data.toString('base64url')
const sha256 = (data: Buffer | string) => createHash('sha256').update(data).digest()

/** Minimal CBOR encoder for the shapes WebAuthn needs (ints, byte/text strings, maps). */
function cbor(value: unknown): Buffer {
  const head = (major: number, n: number) => {
    if (n < 24) return Buffer.from([(major << 5) | n])
    if (n < 256) return Buffer.from([(major << 5) | 24, n])
    if (n < 65536) return Buffer.from([(major << 5) | 25, n >> 8, n & 255])
    const b = Buffer.alloc(5)
    b[0] = (major << 5) | 26
    b.writeUInt32BE(n, 1)
    return b
  }
  if (typeof value === 'number') return value >= 0 ? head(0, value) : head(1, -1 - value)
  if (Buffer.isBuffer(value)) return Buffer.concat([head(2, value.length), value])
  if (typeof value === 'string') {
    const text = Buffer.from(value)
    return Buffer.concat([head(3, text.length), text])
  }
  if (value instanceof Map)
    return Buffer.concat([
      head(5, value.size),
      ...[...value].flatMap(([k, v]) => [cbor(k), cbor(v)]),
    ])
  throw new Error('Unsupported CBOR value')
}

export type Flags = { up?: boolean; uv?: boolean }

export function createSoftAuthenticator() {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' })
  const jwk = publicKey.export({ format: 'jwk' })
  const credentialId = randomBytes(32)
  let signCount = 0

  const flagsByte = ({ up = true, uv = true }: Flags, extra = 0) =>
    (up ? 0x01 : 0) | (uv ? 0x04 : 0) | extra
  const clientData = (type: string, challenge: string, origin: string) =>
    Buffer.from(JSON.stringify({ type, challenge, origin, crossOrigin: false }))

  return {
    id: b64(credentialId),
    register(options: { challenge: string; origin: string; rpId: string; flags?: Flags }) {
      const cose = new Map<number, unknown>([
        [1, 2],
        [3, -7],
        [-1, 1],
        [-2, Buffer.from(jwk.x!, 'base64url')],
        [-3, Buffer.from(jwk.y!, 'base64url')],
      ])
      const length = Buffer.alloc(2)
      length.writeUInt16BE(credentialId.length)
      const count = Buffer.alloc(4)
      const authData = Buffer.concat([
        sha256(options.rpId),
        Buffer.from([flagsByte(options.flags ?? {}, 0x40)]),
        count,
        Buffer.alloc(16),
        length,
        credentialId,
        cbor(cose),
      ])
      const attestation = cbor(
        new Map<string, unknown>([
          ['fmt', 'none'],
          ['attStmt', new Map()],
          ['authData', authData],
        ]),
      )
      return {
        id: b64(credentialId),
        rawId: b64(credentialId),
        type: 'public-key',
        response: {
          clientDataJSON: b64(clientData('webauthn.create', options.challenge, options.origin)),
          attestationObject: b64(attestation),
          transports: ['internal'],
        },
        clientExtensionResults: {},
      }
    },
    assert(options: {
      challenge: string
      origin: string
      rpId: string
      userHandle: string
      flags?: Flags
      /** Explicit signature counter (cloned-authenticator replay). */
      counter?: number
      key?: KeyObject
    }) {
      signCount = options.counter ?? signCount + 1
      const count = Buffer.alloc(4)
      count.writeUInt32BE(signCount)
      const authData = Buffer.concat([
        sha256(options.rpId),
        Buffer.from([flagsByte(options.flags ?? {})]),
        count,
      ])
      const data = clientData('webauthn.get', options.challenge, options.origin)
      const signature = sign(
        'sha256',
        Buffer.concat([authData, sha256(data)]),
        options.key ?? privateKey,
      )
      return {
        id: b64(credentialId),
        rawId: b64(credentialId),
        type: 'public-key',
        response: {
          clientDataJSON: b64(data),
          authenticatorData: b64(authData),
          signature: b64(signature),
          userHandle: options.userHandle,
        },
        clientExtensionResults: {},
      }
    },
  }
}
