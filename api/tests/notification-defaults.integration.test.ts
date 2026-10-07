import { readFile } from 'node:fs/promises'

import { describe, expect, it } from 'vitest'

import { emailSample } from '../src/modules/settings/notifications/services/email-sample.js'
import { composeNotification } from '../src/modules/settings/notifications/services/notification-rule.service.js'
import { isolatedDatabase } from './helpers/postgres.js'

const migration = '0026_branded_notification_defaults.sql'
describe('branded notification defaults migration', () => {
  it('installs five working French HTML templates and remains idempotent', async () => {
    const fixture = await isolatedDatabase()
    try {
      const rows = await fixture.client`select * from notification_rules order by event_key`
      expect(rows).toHaveLength(5)
      for (const row of rows) {
        expect(row.body_format).toBe('html')
        expect(row.locale).toBe('fr-MA')
        expect(row.enabled).toBe(false)
        expect(row.subject_template).toContain('Slama Agricole')
        expect(row.body_template.trim()).toBe(
          (
            await readFile(
              new URL(
                `../../docs/notification-email-examples/${row.event_key}.html`,
                import.meta.url,
              ),
              'utf8',
            )
          ).trim(),
        )
        const result = composeNotification(
          {
            eventKey: row.event_key,
            subjectTemplate: row.subject_template,
            bodyTemplate: row.body_template,
            bodyFormat: 'html',
          },
          emailSample,
        )
        expect(result.html).toContain('#faf3df')
        expect(result.html).not.toContain('{{')
      }
      await fixture.client.unsafe(
        await readFile(new URL(`../db/migrations/${migration}`, import.meta.url), 'utf8'),
      )
      expect(await fixture.client`select * from notification_rules order by event_key`).toEqual(
        rows,
      )
    } finally {
      await fixture.cleanup()
    }
  })

  it('preserves custom content/language and operational settings while upgrading placeholder rules', async () => {
    const fixture = await isolatedDatabase(async (name, db) => {
      if (name !== migration) return
      await db`update notification_rules set body_template='<p>Custom HTML</p>',body_format='html',version=7 where event_key='invoice_sent'`
      await db`update notification_rules set subject_template='Custom subject',version=8 where event_key='estimate_sent'`
      await db`update notification_rules set body_template='Custom text',version=9 where event_key='payment_received'`
      await db`update notification_rules set locale='ar-MA',version=10 where event_key='estimate_expiry_reminder'`
      await db`update notification_rules set enabled=true,offset_days=-3,repeat_every_days=7,sender_name='Existing sender',sender_email='custom@example.test',version=11 where event_key='invoice_due_reminder'`
    })
    try {
      const rows = await fixture.client`select * from notification_rules`
      const byEvent = (event: string) => rows.find((row) => row.event_key === event)!
      expect(byEvent('invoice_sent')).toMatchObject({
        body_template: '<p>Custom HTML</p>',
        version: 7,
      })
      expect(byEvent('estimate_sent')).toMatchObject({
        subject_template: 'Custom subject',
        body_format: 'text',
        version: 8,
      })
      expect(byEvent('payment_received')).toMatchObject({
        body_template: 'Custom text',
        body_format: 'text',
        version: 9,
      })
      expect(byEvent('estimate_expiry_reminder')).toMatchObject({
        locale: 'ar-MA',
        body_format: 'text',
        version: 10,
      })
      expect(byEvent('invoice_due_reminder')).toMatchObject({
        body_format: 'html',
        enabled: true,
        offset_days: -3,
        repeat_every_days: 7,
        sender_name: 'Existing sender',
        sender_email: 'custom@example.test',
        version: 12,
      })
    } finally {
      await fixture.cleanup()
    }
  })
})
