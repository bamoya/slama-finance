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
  const registryCity =
    company.registrationNumber?.trim() && company.registrationCity?.trim()
      ? company.registrationCity.trim()
      : null
  await tx
    .update(companySettings)
    .set({
      legalName: company.legalName ?? null,
      legalType: company.legalType ?? 'individual',
      professionalTaxNumber: company.professionalTaxNumber || null,
      // Onboarding never blocks: an unusable capital is ignored rather than failing the activation.
      shareCapital: /^(0|[1-9][0-9]{0,15})(\.[0-9]{1,2})?$/.test(
        (company.shareCapital ?? '').replace(/\s/g, ''),
      )
        ? company.shareCapital!.replace(/\s/g, '')
        : null,
      // An auto-entrepreneur who does not charge VAT starts VAT exempt; everyone else keeps the subject regime.
      vatRegime:
        company.legalType === 'auto_entrepreneur' && !c.defaults.vatEnabled ? 'exempt' : 'subject',
      tradeName: c.name,
      email: company.email ?? null,
      phone: company.phone ?? null,
      addressLine1: company.address ?? null,
      city: company.city ?? null,
      ice: company.ice ?? null,
      taxIdentifier: company.taxIdentifier ?? null,
      // RC and its registry city are a pair; without the city the pair stays empty until company settings.
      registrationNumber: registryCity ? company.registrationNumber!.trim() : null,
      registrationCity: registryCity,
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
