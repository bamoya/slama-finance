import { describe, expect, it } from 'vitest'

import { loadEnvironment } from '../src/config/env.js'
import { createOwnerAccountDelivery } from '../src/integrations/email/owner-account.js'
import { createRecordingEmailProvider } from '../src/integrations/email/transport.js'

describe('Owner security emails and configuration', () => {
  it.each(['fr', 'en'] as const)(
    'renders %s verification and reset HTML with opaque delivery keys',
    async (language) => {
      const provider = createRecordingEmailProvider()
      const delivery = createOwnerAccountDelivery(provider, 'security@example.test')
      for (const purpose of ['verify_email', 'reset_password'] as const) {
        await delivery.send({
          to: 'owner@example.test',
          url: 'https://portal.example/auth/verify-email#token=secret&test=value',
          expiresAt: new Date(),
          language,
          purpose,
        })
      }
      expect(provider.messages).toHaveLength(2)
      for (const message of provider.messages) {
        expect(message.html).toContain(`<html lang="${language}">`)
        expect(message.html).toContain('secret&amp;test=value')
        expect(message.text).toContain('secret&test=value')
        expect(message.idempotencyKey).not.toContain('secret')
        expect(message.attachments).toEqual([])
      }
    },
  )
  it('brands owner invitation emails as B-Finance', async () => {
    const provider = createRecordingEmailProvider()
    await createOwnerAccountDelivery(provider, 'security@example.test').send({
      to: 'owner@example.test',
      url: 'https://portal.example/auth/accept-invitation#token=secret',
      expiresAt: new Date(),
      language: 'fr',
      purpose: 'invitation',
    })
    const [message] = provider.messages
    expect(message?.subject).toBe('Activez votre compte B-Finance')
    expect(message?.from.name).toBe('B-Finance')
    expect(`${message?.text}${message?.html}`).not.toContain('Slama')
  })
  it('derives the owner portal from the platform domain and defaults registration to disabled', () => {
    expect(loadEnvironment({ NODE_ENV: 'test' }).OWNER_AUTH_ENABLED).toBe(false)
    expect(
      loadEnvironment({ NODE_ENV: 'test', OWNER_AUTH_ENABLED: 'true' }).OWNER_AUTH_ENABLED,
    ).toBe(true)
  })
})
