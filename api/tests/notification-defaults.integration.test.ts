import { readFile } from 'node:fs/promises'

import { describe, expect, it } from 'vitest'

import { emailSample } from '../src/modules/settings/notifications/services/email-sample.js'
import { composeNotification } from '../src/modules/settings/notifications/services/notification-rule.service.js'
import { isolatedDatabase } from './helpers/postgres.js'

const migration = '0001_required_defaults.sql'
describe('branded notification defaults migration', () => {
  it('installs six working French HTML templates and remains idempotent', async () => {
    const fixture = await isolatedDatabase()
    try {
      const rows = await fixture.client`select * from notification_rules order by event_key`
      expect(rows).toHaveLength(6)
      for (const row of rows) {
        expect(row.body_format).toBe('html')
        expect(row.locale).toBe('company')
        expect(row.english_subject_template).toContain('Slama Agricole')
        expect(row.english_body_template).toContain('Hello {{clientName}}')
        expect(row.enabled).toBe(false)
        expect(row.subject_template).toContain('Slama Agricole')
        if (row.event_key !== 'delivery_prepared')
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
        expect(result.html).toContain(row.event_key === 'delivery_prepared' ? '#8f6515' : '#faf3df')
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

  it('never overwrites customized rules when required defaults are reapplied', async () => {
    const fixture = await isolatedDatabase()
    try {
      await fixture.client`update notification_rules set body_template='<p>Custom HTML</p>', english_body_template='<p>Custom English</p>', locale='en-GB', enabled=true, sender_email='custom@example.test', version=7 where event_key='invoice_sent'`
      const before = await fixture.client`select * from notification_rules order by event_key`
      await fixture.client.unsafe(
        await readFile(new URL(`../db/migrations/${migration}`, import.meta.url), 'utf8'),
      )
      expect(await fixture.client`select * from notification_rules order by event_key`).toEqual(
        before,
      )
    } finally {
      await fixture.cleanup()
    }
  })
})
