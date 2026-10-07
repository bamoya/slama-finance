import { createHash } from 'node:crypto'

import nodemailer from 'nodemailer'

import type { EmailProvider } from '../contracts.js'
import { EmailTransportError } from './transport.js'

/** Local Mailpit transport only; SMTP does not guarantee idempotent delivery. */
export function createSmtpEmailProvider(options: { host: string; port: number }): EmailProvider {
  const transport = nodemailer.createTransport({
    host: options.host,
    port: options.port,
    secure: false,
    ignoreTLS: true,
    connectionTimeout: 4000,
    greetingTimeout: 4000,
    socketTimeout: 10000,
    disableFileAccess: true,
    disableUrlAccess: true,
  })
  return {
    supportsIdempotency: false,
    async send(input, signal) {
      if (signal?.aborted) throw new EmailTransportError('PROVIDER_TIMEOUT', false)
      try {
        const result = await transport.sendMail({
          from: { name: input.from.name, address: input.from.email },
          to: input.to,
          cc: input.cc,
          subject: input.subject,
          html: input.html,
          text: input.text,
          messageId: `<${createHash('sha256').update(input.idempotencyKey).digest('hex')}@slama.local>`,
          attachments: input.attachments.map((item) => ({
            filename: item.filename,
            contentType: item.contentType,
            content: Buffer.from(item.bytes),
          })),
        })
        if (result.rejected.length) throw new EmailTransportError('PROVIDER_REJECTED', true, '4xx')
        return { providerMessageId: result.messageId }
      } catch (error) {
        if (error instanceof EmailTransportError) throw error
        const status =
          error && typeof error === 'object' && 'responseCode' in error
            ? Number(error.responseCode)
            : 0
        // Never expose SMTP errors: they can contain addresses and message content.
        throw new EmailTransportError(
          status >= 500 ? 'PROVIDER_REJECTED' : 'PROVIDER_UNAVAILABLE',
          status >= 500,
          status >= 500 ? '5xx' : status >= 400 ? '4xx' : 'network',
        )
      }
    },
  }
}
