// Second organization "Atlas Négoce Export" with a little activity (for the owner overview, ch09).
import { randomUUID } from 'node:crypto'
import { OUT, clearMailFor } from './lib.mjs'
import { ownerApi, staffApi, stateFor } from './seed.mjs'
import { COMPANY, KARIM, daysFromToday } from './data.mjs'

export async function seedExport() {
  await clearMailFor(KARIM.email) // drop old temporary-password mails so the new org's one is used
  const o = await ownerApi()
  const existing = ((await o.get('/api/v1/owner/organizations')).items ?? []).find(
    (x) => x.slug === 'atlas-export',
  )
  const created =
    existing ??
    (await o.post('/api/v1/owner/organizations', {
      name: 'Atlas Négoce Export',
      slug: 'atlas-export',
      activity: 'Export de produits agricoles',
      requestId: randomUUID(),
    }))
  const id = created.id ?? created.organization?.id
  let ob = existing ? null : await o.get(`/api/v1/owner/organizations/${id}/onboarding`)
  const cfg = {
    name: 'Atlas Négoce Export',
    activity: 'Export de produits agricoles',
    company: {
      legalName: 'Atlas Négoce Export SARL AU',
      email: 'export@atlas-negoce.ma',
      phone: '+212 535 52 31 41',
      address: '24, Avenue des FAR, Zone industrielle',
      city: 'Meknès',
      ice: '002154873000058',
      registrationNumber: '18453',
      taxIdentifier: '40128757',
    },
    branding: { accentColor: '#1f5c4a' },
    defaults: {
      layout: 'essential',
      language: 'fr',
      currency: 'MAD',
      paymentDueDays: 30,
      estimateValidDays: 15,
      compact: false,
      vatEnabled: true,
      vatRate: 20,
    },
    invitations: [],
  }
  if (!existing)
    ob = await o.put(`/api/v1/owner/organizations/${id}/onboarding`, {
      configuration: cfg,
      currentStep: 6,
      expectedVersion: ob.version,
    })
  if (!existing)
    await o.post(`/api/v1/owner/organizations/${id}/onboarding/complete`, {
      expectedVersion: ob.version,
    })
  const w = await staffApi('atlas-export', KARIM.email)
  const bank = await w.post('/api/v1/bank-accounts', {
    name: 'Compte devises',
    bankName: COMPANY.bankName,
    accountHolder: 'Atlas Négoce Export',
    rib: COMPANY.rib,
    iban: COMPANY.iban,
    currency: 'MAD',
  })
  const clients = []
  for (const [n, c, city] of [
    ['Maghreb Fruits Import', 'Laurent Dupuis', 'Marseille'],
    ['Iberia Agro Trading', 'Marta Ruiz', 'Almería'],
    ['Sahel Distribution', 'Ibrahima Diallo', 'Dakar'],
  ])
    clients.push(
      (
        await w.post('/api/v1/clients', {
          type: 'company',
          legalName: n,
          contactName: c,
          email: `contact@${n.toLowerCase().replace(/[^a-z]+/g, '-')}.com`,
          city,
          countryCode: city === 'Marseille' ? 'FR' : city === 'Almería' ? 'ES' : 'SN',
          locale: 'fr-MA',
        })
      ).id,
    )
  const p = await w.post('/api/v1/products', {
    reference: 'EXP-001',
    name: 'Agrumes Nadorcott (palette 600 kg)',
    description: null,
    categoryId: null,
    imageAssetId: null,
    suggestedVatRate: '0.00',
    variants: [{ weightG: 600000, pricePerItem: '7800.00', costPerItem: '5400.00', active: true }],
  })
  const dates = [50, 34, 23, 11, 5].map((n) => daysFromToday(-n))
  for (let i = 0; i < dates.length; i++) {
    const d = await w.post('/api/v1/invoices', {
      clientId: clients[i % 3],
      templateId: null,
      issueDate: dates[i],
      dueDate: daysFromToday([-34, -18, -7, 5, 11][i]),
      notes: null,
      paymentTerms: 'Paiement à 30 jours',
      bankAccountId: bank.id,
      agreedPaymentMethod: 'bank_transfer',
      lines: [
        {
          productVariantId: p.variants[0].id,
          productName: p.name,
          quantity: 2 + i,
          unitPrice: '7800.00',
          vatRate: '0.00',
        },
      ],
    })
    const iss = await w.post(`/api/v1/invoices/${d.id}/issue`, { expectedVersion: d.version })
    if (i < 3)
      await w.post('/api/v1/payments', {
        operationId: randomUUID(),
        invoiceId: d.id,
        amount: String(iss.totalTtc ?? iss.amountTtc ?? iss.total),
        currency: 'MAD',
        method: 'bank_transfer',
        status: 'confirmed',
        paymentDate: daysFromToday([-40, -26, -15][i]),
        collectedOn: daysFromToday([-40, -26, -15][i]),
        bankAccountId: bank.id,
        reference: `VIR-EXP-${i + 1}`,
        chequeBank: null,
        chequeNumber: null,
      })
  }
  console.log('export org seeded')
}
if (import.meta.url === `file://${process.argv[1]}`) await seedExport()
