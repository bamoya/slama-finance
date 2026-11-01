import { describe, expect, it } from 'vitest'

import { sanitizeEmailHtml } from '../src/modules/organization/settings/notifications/services/email-html.js'
import { composeNotification } from '../src/modules/organization/settings/notifications/services/notification-rule.service.js'

const rule = {
  eventKey: 'invoice_sent' as const,
  subjectTemplate: 'Document {{documentNumber}}',
  bodyFormat: 'html' as const,
  bodyTemplate:
    '<h2>Bonjour {{clientName}}</h2><table><tr><td>{{total}} {{currency}}</td></tr></table><a href="https://example.test" style="background-color:#a77718;padding:12px 20px;color:#ffffff">Consulter</a>',
}
describe('notification HTML composition', () => {
  it('preserves safe formatting and creates the plain-text alternative from the same content', () => {
    const result = composeNotification(rule, {
      documentNumber: 'FAC-1',
      clientName: '<img src=x onerror=alert(1)>',
      total: '1250',
      currency: 'MAD',
    })
    expect(result.subject).toBe('Document FAC-1')
    expect(result.html).toContain('<h2>')
    expect(result.html).toContain('<table')
    expect(result.html).toContain('background-color:#a77718')
    expect(result.html).not.toContain('<img')
    expect(result.html).toContain('&lt;img')
    expect(result.text).toContain('1\u202f250 MAD')
    expect(result.text).not.toContain('<table')
  })
  it('removes executable tags, events, dangerous URLs, CSS and attribute variables', () => {
    const html = sanitizeEmailHtml(
      '<script>alert(1)</script><iframe src="https://example.test"></iframe><form>hidden</form><img src="data:image/svg+xml,bad" onerror="bad()"><a href="jav&#97;script:alert(1)">X</a><a href="//example.test">Y</a><a href="https://example.test/{{clientName}}">Z</a><p style="position:fixed;background-image:url(https://example.test);color:#ff0000">Safe</p>',
    )
    expect(html).not.toMatch(/script|iframe|<form|onerror|data:|href=|position|background-image/)
    expect(html).toContain('color:#ff0000')
  })
  it('keeps legacy text literal and validates HTML variables before sanitizing', () => {
    const result = composeNotification(
      { ...rule, bodyFormat: 'text', bodyTemplate: '<b>{{clientName}}</b>' },
      { clientName: 'A' },
    )
    expect(result.html).toContain('&lt;b&gt;A&lt;/b&gt;')
    expect(() =>
      composeNotification({ ...rule, bodyTemplate: '<script>{{invalid}}</script>' }, {}),
    ).toThrow()
  })
  it('is idempotent and preserves safe advanced HTML without visual-editor conversion', () => {
    const html =
      '<table role="presentation" cellpadding="12" style="width:100%"><tbody><tr><td colspan="2" style="background-color:#eeeeee"><strong>Title</strong></td></tr></tbody></table>'
    const safe = sanitizeEmailHtml(html)
    expect(sanitizeEmailHtml(safe)).toBe(safe)
    expect(safe).toContain('colspan="2"')
    expect(safe).toContain('cellpadding="12"')
  })
})

describe('business email branding and formatting', () => {
  const legacy = {
    eventKey: 'invoice_due_reminder' as const,
    subjectTemplate: 'B-Finance — Échéance {{documentNumber}}',
    bodyFormat: 'html' as const,
    bodyTemplate:
      '<div><p style="margin:0;font-size:26px">BaMoYa</p>\n    <p style="margin:0;font-size:12px">Finance</p><p>{{outstanding}} {{currency}} le {{dueDate}}</p><p>L’équipe B-Finance</p></div>',
  }
  const values = {
    organizationName: 'Atlas Négoce SARL',
    documentNumber: 'FAC-1',
    outstanding: '126180.00',
    currency: 'MAD',
    dueDate: '2026-12-01',
  }
  it('renders the organization name instead of the platform brand, even for stored legacy templates', () => {
    const result = composeNotification({ ...legacy, locale: 'fr-MA' }, values)
    expect(result.subject).toBe('Atlas Négoce SARL — Échéance FAC-1')
    expect(result.html).toContain('Atlas Négoce SARL')
    expect(result.html).not.toContain('BaMoYa')
    expect(result.html).not.toContain('B-Finance')
    expect(result.html).not.toContain('>Finance<')
  })
  it('formats money and dates by language', () => {
    const fr = composeNotification({ ...legacy, locale: 'fr-MA' }, values)
    expect(fr.text).toContain('126\u202f180,00 MAD le 01-12-2026')
    const en = composeNotification({ ...legacy, locale: 'en-GB' }, values)
    expect(en.text).toContain('126,180.00 MAD le 01-12-2026')
  })
})
