import { describe, expect, it } from 'vitest'

import { createProviderResetDelivery } from '../src/integrations/email/reset-delivery.js'
import { createRecordingEmailProvider } from '../src/integrations/email/transport.js'

describe('Provider-neutral staff recovery messages', () => {
  it.each(['fr', 'en'] as const)(
    'sends %s HTML with a safe URL and opaque delivery key',
    async (language) => {
      const provider = createRecordingEmailProvider()
      await createProviderResetDelivery(provider, 'security@slama.local').send({
        to: 'staff@example.test',
        resetUrl: 'https://portal.example/reset-password#token=secret&test=value',
        expiresAt: new Date(),
        language,
      })
      const message = provider.messages[0]!
      expect(message.html).toContain('secret&amp;test=value')
      expect(message.html).toContain(`<html lang="${language}">`)
      expect(message.text).toContain('secret&test=value')
      expect(message.idempotencyKey).not.toContain('secret')
      expect(message.html).not.toContain('owner')
    },
  )
})
