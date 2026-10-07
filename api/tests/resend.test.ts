import { describe, expect, it, vi } from 'vitest'

import { loadEnvironment } from '../src/config/env.js'
import { createResendResetDelivery } from '../src/integrations/email/resend.js'

const message = {
  to: 'staff@example.test',
  resetUrl: 'https://finance.example/reset-password#token=secret-token',
  expiresAt: new Date('2030-01-01T00:00:00Z'),
}
describe('Resend production adapter (mocked network)', () => {
  it('sends with authentication, bounded timeout and an opaque idempotency key', async () => {
    const send = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(JSON.stringify({ id: 'email-id' }), { status: 200 }))
    await createResendResetDelivery({
      apiKey: 'test-key',
      from: 'security@example.test',
      fetch: send,
    }).send(message)
    expect(send.mock.calls[0]![0]).toBe('https://api.resend.com/emails')
    const request = send.mock.calls[0]![1]!
    expect(request.signal).toBeDefined()
    expect(request.headers).toMatchObject({
      Authorization: 'Bearer test-key',
      'Idempotency-Key': expect.stringMatching(/^password-reset\/[a-f0-9]{64}$/),
    })
    expect(JSON.parse(String(request.body))).toMatchObject({
      from: 'security@example.test',
      to: [message.to],
      text: expect.stringContaining(message.resetUrl),
    })
  })
  it('retries transient failures with the same idempotency key', async () => {
    const send = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('', { status: 503 }))
      .mockResolvedValueOnce(new Response('{"id":"sent"}'))
    await createResendResetDelivery({
      apiKey: 'key',
      from: 'security@example.test',
      fetch: send,
    }).send(message)
    expect(send).toHaveBeenCalledTimes(2)
    expect(send.mock.calls[0]![1]!.headers).toEqual(send.mock.calls[1]![1]!.headers)
  })
  it('does not leak provider failures or retry permanent rejections', async () => {
    const send = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('secret provider payload', { status: 403 }))
    const failure = vi.fn()
    await expect(
      createResendResetDelivery({
        apiKey: 'key',
        from: 'security@example.test',
        fetch: send,
        onFailure: failure,
      }).send(message),
    ).rejects.toThrow(/^Password reset email delivery failed$/)
    expect(send).toHaveBeenCalledTimes(1)
    expect(failure).toHaveBeenCalledOnce()
  })
  it('requires complete production configuration and a safe reset URL', () => {
    const base = {
      NODE_ENV: 'production',
      DATABASE_URL: 'postgres://user:pass@db/test',
      CORS_ORIGIN: 'https://finance.example',
      S3_ENDPOINT: 'https://storage.example.test',
      S3_BUCKET: 'private-finance',
      S3_ACCESS_KEY_ID: 'test-access',
      S3_SECRET_ACCESS_KEY: 'test-secret',
    }
    expect(() => loadEnvironment(base)).toThrow('RESEND_API_KEY')
    const email = {
      RESEND_API_KEY: 'key',
      EMAIL_FROM: 'security@example.test',
      PASSWORD_RESET_URL: 'https://finance.example/reset-password',
    }
    expect(loadEnvironment({ ...base, ...email }).EMAIL_FROM).toBe(email.EMAIL_FROM)
    expect(() =>
      loadEnvironment({
        ...base,
        ...email,
        PASSWORD_RESET_URL: 'http://finance.example/reset-password',
      }),
    ).toThrow('PASSWORD_RESET_URL')
    expect(() => loadEnvironment({ RESEND_API_KEY: 'secret-key' })).toThrow('EMAIL_FROM')
  })
})
