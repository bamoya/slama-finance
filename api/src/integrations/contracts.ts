export interface StoredObject {
  key: string
  contentType: string
  byteSize: number
  sha256: string
}
export interface ListedObject {
  key: string
  lastModified: Date
}
// Production Resend adapter is configured through the environment; tests can inject a fake.
export interface PasswordResetDelivery {
  send(input: {
    to: string
    resetUrl: string
    expiresAt: Date
    language?: 'fr' | 'en'
  }): Promise<void>
}
export interface ObjectStorage {
  putImmutable(input: {
    key: string
    bytes: Uint8Array
    contentType: string
  }): Promise<StoredObject>
  get(key: string): Promise<Uint8Array>
  signedDownloadUrl(key: string, expiresInSeconds: number): Promise<string>
  // Required by artifact cleanup; optional for injected media-only test adapters.
  list?(prefix: string): Promise<ListedObject[]>
  // Callers must verify retention and both artifact/attachment references first.
  deleteUnreferenced(key: string): Promise<void>
}
export interface ReadyEmail {
  idempotencyKey: string
  from: { email: string; name: string }
  to: string
  cc: string[]
  subject: string
  html: string
  text?: string
  attachments: { filename: string; contentType: string; bytes: Uint8Array }[]
}
export interface EmailProvider {
  supportsIdempotency: boolean
  send(message: ReadyEmail, signal?: AbortSignal): Promise<{ providerMessageId: string }>
}
