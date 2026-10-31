import { describe, expect, it } from 'vitest'

import { emailSample } from '../src/modules/organization/settings/notifications/services/email-sample.js'
import { composeNotification } from '../src/modules/organization/settings/notifications/services/notification-rule.service.js'
import { isolatedDatabase, testOrganizationId, testOwnerId } from './helpers/postgres.js'

describe('branded notification defaults migration', () => {
  it('installs six disabled French HTML templates per organization', async () => {
    const fixture = await isolatedDatabase()
    try {
      const rows =
        await fixture.client`select * from notification_rules where organization_id=${testOrganizationId} order by event_key`
      expect(rows).toHaveLength(6)
      for (const row of rows) {
        expect(row.body_format).toBe('html')
        expect(row.locale).toBe('company')
        expect(row.english_subject_template).toContain('BaMoYa Finance')
        expect(row.english_body_template).toContain('Hello {{clientName}}')
        expect(row.enabled).toBe(false)
        expect(row.subject_template).toContain('BaMoYa Finance')
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
      await fixture.client`insert into organizations(owner_id,name,slug) values (${testOwnerId},'Another','another')`
      expect(
        await fixture.client`select * from notification_rules where organization_id=${testOrganizationId} order by event_key`,
      ).toEqual(rows)
    } finally {
      await fixture.cleanup()
    }
  })

  it('never overwrites customized rules when another organization is created', async () => {
    const fixture = await isolatedDatabase()
    try {
      await fixture.client`update notification_rules set body_template='<p>Custom HTML</p>', english_body_template='<p>Custom English</p>', locale='en-GB', enabled=true, sender_email='custom@example.test', version=7 where event_key='invoice_sent'`
      const before =
        await fixture.client`select * from notification_rules where organization_id=${testOrganizationId} order by event_key`
      await fixture.client`insert into organizations(owner_id,name,slug) values (${testOwnerId},'Another','another')`
      expect(
        await fixture.client`select * from notification_rules where organization_id=${testOrganizationId} order by event_key`,
      ).toEqual(before)
    } finally {
      await fixture.cleanup()
    }
  })
})
