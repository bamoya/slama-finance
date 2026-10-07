import type { EmailProvider, ReadyEmail } from '../contracts.js'

export class EmailTransportError extends Error {
  constructor(
    public readonly code: string,
    public readonly permanent: boolean,
    public readonly responseClass: '4xx' | '5xx' | 'network' | 'internal' = 'network',
  ) {
    super(code)
  }
}
export function createRecordingEmailProvider() {
  const messages: ReadyEmail[] = []
  const accepted = new Map<string, string>()
  return {
    supportsIdempotency: true,
    messages,
    async send(input: ReadyEmail) {
      const previous = accepted.get(input.idempotencyKey)
      if (previous) return { providerMessageId: previous }
      const id = `recorded-${messages.length + 1}`
      messages.push(structuredClone(input))
      accepted.set(input.idempotencyKey, id)
      return { providerMessageId: id }
    },
  } satisfies EmailProvider & { messages: ReadyEmail[] }
}
export function createResendEmailProvider(options: {
  apiKey: string
  fetch?: typeof fetch
}): EmailProvider {
  const send = options.fetch ?? globalThis.fetch
  return {
    supportsIdempotency: true,
    async send(input, signal) {
      let response: Response
      try {
        response = await send('https://api.resend.com/emails', {
          method: 'POST',
          redirect: 'error',
          signal: signal ?? AbortSignal.timeout(20_000),
          headers: {
            Authorization: `Bearer ${options.apiKey}`,
            'Content-Type': 'application/json',
            'Idempotency-Key': input.idempotencyKey,
          },
          body: JSON.stringify({
            from: `${input.from.name} <${input.from.email}>`,
            to: [input.to],
            cc: input.cc,
            subject: input.subject,
            html: input.html,
            text: input.text,
            attachments: input.attachments.map((a) => ({
              filename: a.filename,
              content: Buffer.from(a.bytes).toString('base64'),
              content_type: a.contentType,
            })),
          }),
        })
      } catch {
        throw new EmailTransportError('PROVIDER_TIMEOUT', false)
      }
      if (!response.ok) {
        let providerCode: unknown
        if (response.status === 409) {
          try {
            const data: unknown = await response.json()
            if (data && typeof data === 'object' && 'name' in data) providerCode = data.name
          } catch {
            /* Unrecognized conflict fails permanently. */
          }
        } else await response.body?.cancel().catch(() => {})
        const retryable =
          response.status === 429 ||
          response.status >= 500 ||
          (response.status === 409 && providerCode === 'concurrent_idempotent_requests')
        throw new EmailTransportError(
          response.status === 429
            ? 'PROVIDER_RATE_LIMITED'
            : retryable
              ? 'PROVIDER_UNAVAILABLE'
              : 'PROVIDER_REJECTED',
          !retryable,
          response.status >= 500 ? '5xx' : '4xx',
        )
      }
      const body: unknown = await response.json()
      if (!body || typeof body !== 'object' || !('id' in body) || typeof body.id !== 'string')
        throw new EmailTransportError('PROVIDER_RESPONSE_INVALID', false)
      return { providerMessageId: body.id }
    },
  }
}
