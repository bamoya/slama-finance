import { describe, expect, it, vi } from 'vitest'

import {
  createRecordingEmailProvider,
  createResendEmailProvider,
} from '../src/integrations/email/transport.js'
import { clientNotificationEligibility } from '../src/modules/clients/services/client-notification.service.js'
import {
  assertSendable,
  reminderOccurs,
} from '../src/modules/sales/notifications/services/sales-notification.service.js'
import {
  composeNotification,
  validateRuleTemplates,
} from '../src/modules/settings/notifications/services/notification-rule.service.js'
import type { ComposedMessage } from '../src/support/notifications/index.js'
import {
  canonicalMessageHash,
  validateComposedMessage,
} from '../src/support/notifications/services/notification.service.js'

const message: ComposedMessage = {
  idempotencyKey: 'test:one',
  actor: null,
  from: { email: 'sender@example.test', name: 'Finance' },
  to: 'client@example.test',
  cc: [],
  subject: 'Document',
  html: '<p>Document</p>',
  text: 'Document',
  attachments: [],
}

describe('notification policies and transport', () => {
  it('requires global opt-in, valid email and current active client even when overridden', () => {
    expect(clientNotificationEligibility(false, true, 'client@example.test', false)).toBe(
      'RULE_DISABLED',
    )
    expect(clientNotificationEligibility(true, false, 'client@example.test', false)).toBe(
      'CLIENT_OPT_OUT',
    )
    expect(clientNotificationEligibility(true, null, 'bad address', false)).toBe('MISSING_EMAIL')
    expect(clientNotificationEligibility(true, null, 'client@example.test', true)).toBe(
      'CLIENT_ARCHIVED',
    )
    expect(clientNotificationEligibility(true, null, 'client@example.test', false)).toBeNull()
  })
  it('escapes interpolated values and literal markup with an event-specific variable allowlist', () => {
    const rule = {
      eventKey: 'invoice_sent' as const,
      subjectTemplate: '{{documentNumber}}',
      bodyTemplate: '<script>{{clientName}}</script>\n{{total}}',
    }
    const result = composeNotification(rule, {
      documentNumber: 'FAC-1\r\nBCC: other',
      clientName: '<img src=x onerror=alert(1)>',
      total: '100.00',
    })
    expect(result.subject).not.toMatch(/[\r\n]/)
    expect(result.html).not.toContain('<script>')
    expect(result.html).not.toContain('<img')
    expect(result.html).toContain('&lt;script&gt;')
    expect(() => validateRuleTemplates('invoice_sent', '{{paymentNumber}}', 'Hello')).toThrow(
      'unavailable',
    )
    expect(() => validateRuleTemplates('invoice_sent', '{constructor}', 'Hello')).toThrow(
      'double-brace',
    )
  })
  it('uses date-only reminder offsets/repeats without timezone shifts', () => {
    expect(reminderOccurs('2026-10-10', '2026-10-07', -3, 2)).toBe(true)
    expect(reminderOccurs('2026-10-10', '2026-10-08', -3, 2)).toBe(false)
    expect(reminderOccurs('2026-10-10', '2026-10-09', -3, 2)).toBe(true)
    expect(reminderOccurs('2026-10-10', '2026-10-11', 0, null)).toBe(false)
  })
  it('preserves accepted estimates and blocks cancelled, superseded, expired and draft sends', () => {
    expect(() => assertSendable('estimate', 'accepted')).not.toThrow()
    for (const status of ['cancelled', 'superseded', 'expired', 'draft', 'rejected'])
      expect(() => assertSendable('estimate', status)).toThrow()
    expect(() => assertSendable('invoice', 'sent')).not.toThrow()
  })
  it('rejects sender, duplicate CC, filename/path injection and private attachment size abuse', () => {
    expect(() => validateComposedMessage(message, ['sender@example.test'])).not.toThrow()
    expect(() =>
      validateComposedMessage({ ...message, cc: ['X@example.test', 'x@example.test'] }, [
        'sender@example.test',
      ]),
    ).toThrow()
    expect(() => validateComposedMessage(message, [])).toThrow()
    expect(() =>
      validateComposedMessage(
        {
          ...message,
          attachments: [
            {
              objectKey: 'artifacts/invoice/11111111-1111-4111-8111-111111111111.pdf',
              filename: '../secret',
              contentType: 'application/pdf',
              byteSize: 8,
              position: 0,
            },
          ],
        },
        ['sender@example.test'],
      ),
    ).toThrow()
    expect(canonicalMessageHash(message)).not.toBe(
      canonicalMessageHash({ ...message, to: 'other@example.test' }),
    )
  })
  it('records local sends without network and preserves provider acceptance identity', async () => {
    const provider = createRecordingEmailProvider()
    const input = { ...message, attachments: [] }
    const first = await provider.send(input)
    expect(await provider.send(input)).toEqual(first)
    expect(provider.messages).toHaveLength(1)
  })
  it('uses the same provider idempotency key and classifies permanent/retryable failures without leaking responses', async () => {
    const fake = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'provider-id' }), { status: 200 }))
      .mockResolvedValueOnce(new Response('private-body', { status: 422 }))
      .mockResolvedValueOnce(new Response('private-body', { status: 429 }))
    const provider = createResendEmailProvider({ apiKey: 'test-private-key', fetch: fake })
    expect(await provider.send({ ...message, attachments: [] })).toEqual({
      providerMessageId: 'provider-id',
    })
    expect(fake.mock.calls[0]?.[1]?.headers).toMatchObject({ 'Idempotency-Key': 'test:one' })
    await expect(provider.send({ ...message, attachments: [] })).rejects.toMatchObject({
      code: 'PROVIDER_REJECTED',
      permanent: true,
    })
    await expect(provider.send({ ...message, attachments: [] })).rejects.toMatchObject({
      code: 'PROVIDER_RATE_LIMITED',
      permanent: false,
    })
  })
})
