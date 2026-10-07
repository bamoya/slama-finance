import { beforeEach, describe, expect, it, vi } from 'vitest'

import { loadEnvironment } from '../src/config/env.js'
import type { ReadyEmail } from '../src/integrations/contracts.js'
import { createSmtpEmailProvider } from '../src/integrations/email/smtp.js'

const mocks = vi.hoisted(() => ({ sendMail: vi.fn(), createTransport: vi.fn() }))
vi.mock('nodemailer', () => ({ default: { createTransport: mocks.createTransport } }))
beforeEach(() => {
  vi.clearAllMocks()
  mocks.createTransport.mockReturnValue({ sendMail: mocks.sendMail })
  mocks.sendMail.mockResolvedValue({ messageId: '<local@slama.local>', rejected: [] })
})
const message: ReadyEmail = {
  idempotencyKey: 'test:local-email',
  from: { name: 'Slama Finance', email: 'sender@example.test' },
  to: 'recipient@example.test',
  cc: [],
  subject: 'Local test',
  text: 'Test',
  html: '<p>Test</p>',
  attachments: [
    { filename: 'test.pdf', contentType: 'application/pdf', bytes: Buffer.from('%PDF-1.4') },
  ],
}
describe('local Mailpit SMTP', () => {
  it('sends bodies and attachments without claiming SMTP idempotency', async () => {
    const provider = createSmtpEmailProvider({ host: '127.0.0.1', port: 1025 })
    expect(provider.supportsIdempotency).toBe(false)
    expect(await provider.send(message)).toEqual({ providerMessageId: '<local@slama.local>' })
    expect(mocks.createTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        host: '127.0.0.1',
        port: 1025,
        disableFileAccess: true,
        disableUrlAccess: true,
      }),
    )
    expect(mocks.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: message.to,
        html: message.html,
        text: message.text,
        messageId: expect.stringMatching(/^<[a-f0-9]{64}@slama.local>$/),
        attachments: [
          {
            filename: 'test.pdf',
            contentType: 'application/pdf',
            content: Buffer.from('%PDF-1.4'),
          },
        ],
      }),
    )
  })
  it('sanitizes failures and distinguishes temporary from permanent SMTP responses', async () => {
    const provider = createSmtpEmailProvider({ host: '127.0.0.1', port: 1025 })
    mocks.sendMail.mockRejectedValue({ responseCode: 550, message: 'private recipient' })
    await expect(provider.send(message)).rejects.toMatchObject({
      code: 'PROVIDER_REJECTED',
      permanent: true,
      message: 'PROVIDER_REJECTED',
    })
    mocks.sendMail.mockRejectedValue({ responseCode: 421 })
    await expect(provider.send(message)).rejects.toMatchObject({
      code: 'PROVIDER_UNAVAILABLE',
      permanent: false,
    })
    mocks.sendMail.mockResolvedValue({ messageId: 'x', rejected: [message.to] })
    await expect(provider.send(message)).rejects.toMatchObject({ permanent: true })
  })
  it('does not send an already aborted request', async () => {
    await expect(
      createSmtpEmailProvider({ host: 'localhost', port: 1025 }).send(message, AbortSignal.abort()),
    ).rejects.toMatchObject({ code: 'PROVIDER_TIMEOUT' })
    expect(mocks.sendMail).not.toHaveBeenCalled()
  })
  it('accepts local configuration without Resend credentials and rejects production SMTP or remote hosts', () => {
    expect(
      loadEnvironment({
        NODE_ENV: 'development',
        NOTIFICATION_TRANSPORT: 'smtp',
        EMAIL_FROM: 'local@example.test',
      }).SMTP_PORT,
    ).toBe(1025)
    expect(() =>
      loadEnvironment({ NODE_ENV: 'production', NOTIFICATION_TRANSPORT: 'smtp' }),
    ).toThrow('NOTIFICATION_TRANSPORT')
    expect(() =>
      loadEnvironment({
        NODE_ENV: 'development',
        NOTIFICATION_TRANSPORT: 'smtp',
        SMTP_HOST: 'smtp.example.com',
      }),
    ).toThrow()
  })
})
