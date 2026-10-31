import { randomUUID } from 'node:crypto'

import { and, eq, sql } from 'drizzle-orm'

import {
  bankAccounts,
  companySettings,
  documentTemplates,
} from '../../../../../db/schema/settings.js'
import type { OwnerOnboardingConfiguration } from '../../../../contracts/generated/identity/owner-onboarding.schemas.js'
import type { Transaction } from '../../../../lib/db.js'
/** Atomic initial materialization, invoked only after identity checks and optimistic setup locking. */
export async function applyOrganizationSetup(
  tx: Transaction,
  c: OwnerOnboardingConfiguration,
  actorId: string,
) {
  const templateId = randomUUID(),
    company = c.company
  let bankId: string | null = null
  if (c.defaults.bankName && c.defaults.accountHolder && (c.defaults.rib || c.defaults.iban)) {
    bankId = randomUUID()
    await tx.insert(bankAccounts).values({
      id: bankId,
      name: c.defaults.bankName,
      bankName: c.defaults.bankName,
      accountHolder: c.defaults.accountHolder,
      rib: c.defaults.rib?.replace(/\s/g, '') || null,
      iban: c.defaults.iban || null,
      createdByActorId: actorId,
      updatedByActorId: actorId,
    })
  }
  await tx.insert(documentTemplates).values({
    id: templateId,
    name: c.defaults.language === 'fr' ? 'Modèle par défaut' : 'Default template',
    layout: c.defaults.layout,
    density: c.defaults.compact ? 'compact' : 'standard',
    accentColor: c.branding.accentColor,
    logoAssetId: c.branding.logoAssetId ?? null,
    signatureAssetId: c.branding.signatureAssetId ?? null,
    showSignature: !!c.branding.signatureAssetId,
    footerText: c.defaults.footerText ?? null,
    createdByActorId: actorId,
    updatedByActorId: actorId,
  })
  await tx
    .update(companySettings)
    .set({
      legalName: company.legalName ?? null,
      tradeName: c.name,
      email: company.email ?? null,
      phone: company.phone ?? null,
      addressLine1: company.address ?? null,
      city: company.city ?? null,
      ice: company.ice ?? null,
      taxIdentifier: company.taxIdentifier ?? null,
      registrationNumber: company.registrationNumber ?? null,
      registrationCity: company.registrationNumber ? (company.city ?? null) : null,
      locale: c.defaults.language === 'fr' ? 'fr-MA' : 'en-GB',
      currency: 'MAD',
      timezone: 'Africa/Casablanca',
      paymentDueDays: c.defaults.paymentDueDays,
      estimateValidDays: c.defaults.estimateValidDays,
      defaultVatRate: c.defaults.vatEnabled ? c.defaults.vatRate.toFixed(2) : null,
      defaultTemplateId: templateId,
      defaultBankAccountId: bankId,
      logoAssetId: c.branding.logoAssetId ?? null,
      createdByActorId: actorId,
      updatedByActorId: actorId,
    })
    .where(
      and(
        eq(companySettings.id, 1),
        eq(
          companySettings.organizationId,
          sql`nullif(current_setting('app.organization_id',true),'')::uuid`,
        ),
      ),
    )
}
