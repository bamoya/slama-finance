import { describe, expect, it } from 'vitest'

import { NotificationRuleUpdateSchema } from '../src/contracts/generated/settings/notifications.schemas.js'
import { documentLabel } from '../src/lib/documents/document-labels.js'
import { resolveLanguage, resolveLocale } from '../src/lib/language.js'

describe('company language resolution', () => {
  it('inherits company language and defaults to French', () => {
    expect(resolveLanguage()).toBe('fr')
    expect(resolveLanguage('company', 'en-GB')).toBe('en')
    expect(resolveLocale(null, 'en-GB')).toBe('en-GB')
    expect(resolveLocale('fr-MA', 'en-GB')).toBe('fr-MA')
    expect(resolveLanguage('en', 'fr-MA')).toBe('en')
    expect(resolveLanguage('ar-MA')).toBe('fr')
  })
  it('localizes generated document labels without changing arbitrary data', () => {
    expect(documentLabel('AMOUNT RECEIVED', 'fr-MA')).toBe('MONTANT REÇU')
    expect(documentLabel('Qty', 'fr-MA')).toBe('Qté')
    expect(documentLabel('Qty', 'en-GB')).toBe('Qty')
    expect(documentLabel('Customer’s custom product', 'fr-MA')).toBe('Customer’s custom product')
  })
  it('does not allow Arabic as a rule override', () => {
    expect(NotificationRuleUpdateSchema.shape.locale.safeParse('ar-MA').success).toBe(false)
    expect(NotificationRuleUpdateSchema.shape.locale.safeParse('company').success).toBe(true)
    expect(NotificationRuleUpdateSchema.shape.locale.safeParse('en-GB').success).toBe(true)
  })
})
