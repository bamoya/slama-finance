import { randomUUID } from 'node:crypto'

import { and, eq, isNull, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'

import { seedCatalog } from './seed-catalog.mjs'

const seedName = 'slama-demo-v1'
const marker = 'DEMO — Données fictives, hors comptabilité réelle.'

// Uses the compiled domain services shipped in the release image, not HTTP or workers.
export async function seedDemo(connection, now = new Date()) {
  await seedCatalog(connection)
  const schema = await import('../dist/db/schema/index.js')
  const { FinancialDecimal: Decimal } = await import('../dist/src/lib/validation.js')
  const { createEstimateRepository } =
    await import('../dist/src/modules/sales/estimates/repositories/estimate.repository.js')
  const { createEstimateService } =
    await import('../dist/src/modules/sales/estimates/services/estimate.service.js')
  const { createInvoiceRepository } =
    await import('../dist/src/modules/sales/invoices/repositories/invoice.repository.js')
  const { createInvoiceService } =
    await import('../dist/src/modules/sales/invoices/services/invoice.service.js')
  const { createDeliveryNoteRepository } =
    await import('../dist/src/modules/sales/delivery-notes/repositories/delivery-note.repository.js')
  const { createDeliveryNoteService } =
    await import('../dist/src/modules/sales/delivery-notes/services/delivery-note.service.js')
  const { createPaymentRepository } =
    await import('../dist/src/modules/sales/payments/repositories/payment.repository.js')
  const { createPaymentService } =
    await import('../dist/src/modules/sales/payments/services/payment.service.js')
  const db = drizzle(connection, { schema })
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(1936482669, 3)`)
    const [applied] = await tx
      .select()
      .from(schema.auditEvents)
      .where(
        and(
          eq(schema.auditEvents.action, 'seed'),
          eq(schema.auditEvents.entityTable, 'demo_seed'),
          sql`${schema.auditEvents.entityKey}->>'name' = ${seedName}`,
        ),
      )
    if (applied) return false
    const [admin] = await tx
      .select({ id: schema.users.id })
      .from(schema.users)
      .innerJoin(schema.userRoles, eq(schema.users.id, schema.userRoles.userId))
      .innerJoin(schema.roles, eq(schema.roles.id, schema.userRoles.roleId))
      .where(
        and(
          eq(schema.roles.key, 'admin'),
          eq(schema.roles.isSystem, true),
          isNull(schema.users.archivedAt),
          isNull(schema.users.disabledAt),
        ),
      )
      .limit(1)
    if (!admin) throw new Error('Demo seed requires an existing administrator')
    const actor = admin.id
    const ids = {
      clients: [],
      estimates: [],
      invoices: [],
      payments: [],
      deliveryNotes: [],
      templates: [],
      bankAccounts: [],
    }
    const [company] = await tx
      .select()
      .from(schema.companySettings)
      .where(eq(schema.companySettings.id, 1))
    // Never fill real legal/tax settings with dummy identity. Only demo snapshots use this issuer.
    const demoCompany = {
      ...company,
      legalName: 'DEMO — Slama Agricole',
      tradeName: 'DEMO — Slama Agricole',
      addressLine1: 'Adresse fictive de démonstration',
      city: 'Beni Mellal',
      ice: null,
      taxIdentifier: null,
      registrationNumber: null,
      registrationCity: null,
      professionalTaxNumber: null,
      email: null,
      phone: null,
      logoAssetId: null,
    }
    const bind = (factory) => ({
      ...factory(() => tx),
      // The explicitly opted-in owner initializer has seed authority, including before onboarding.
      // This override is local to these seed instances; production authorization is unchanged.
      authorize: async () => {},
      company: async () => demoCompany,
    })
    const noPdfJobs = { enqueuePdfInTransaction: async () => {} }
    const estimates = createEstimateService(bind(createEstimateRepository), noPdfJobs, {})
    const invoices = createInvoiceService(bind(createInvoiceRepository), noPdfJobs, {})
    const deliveries = createDeliveryNoteService(bind(createDeliveryNoteRepository), noPdfJobs, {})
    const payments = createPaymentService(bind(createPaymentRepository))
    // Keep collection dates in the past, including deployments on the first of a month.
    const anchor = new Date(now.getTime() - 2 * 86400000)
    const dateFor = (i, count) =>
      new Date(
        Date.UTC(
          anchor.getUTCFullYear(),
          anchor.getUTCMonth() - 11 + Math.floor((i * 12) / count),
          1,
        ),
      )
        .toISOString()
        .slice(0, 10)
    const plus = (date, days) =>
      new Date(new Date(`${date}T12:00:00Z`).getTime() + days * 86400000).toISOString().slice(0, 10)
    const timestamp = (date) => new Date(`${date}T12:00:00Z`)
    const variants = await tx
      .select({ id: schema.productVariants.id, price: schema.productVariants.pricePerItem })
      .from(schema.productVariants)
      .innerJoin(schema.products, eq(schema.products.id, schema.productVariants.productId))
      .where(
        and(
          sql`${schema.products.reference} LIKE 'SLAMA-WEB-%'`,
          isNull(schema.products.archivedAt),
          isNull(schema.productVariants.archivedAt),
        ),
      )
      .orderBy(schema.products.reference, schema.productVariants.weightG)
    if (!variants.length) throw new Error('Demo seed requires active starter catalogue variants')
    const linesFor = (i) =>
      Array.from({ length: 2 + (i % 4) }, (_, p) => {
        const variant = variants[(i + p * 3) % variants.length]
        return {
          productVariantId: variant.id,
          productName: '',
          quantity: 10 + ((i * 7 + p * 11) % 90),
          unitPrice: variant.price,
          vatRate: i % 9 === 0 ? '20.00' : null,
        }
      })
    const cities = [
      'Casablanca',
      'Rabat',
      'Marrakech',
      'Beni Mellal',
      'Fès',
      'Tanger',
      'Agadir',
      'Meknès',
    ]
    const names = [
      'Atlas',
      'Palmeraie',
      'Oliviers',
      'Rif',
      'Soleil',
      'Jardins',
      'Marché',
      'Terroir',
      'Oasis',
      'Grain',
      'Récolte',
      'Montagne',
    ]
    for (let i = 0; i < 20; i++) {
      const business = i < 12
      const [client] = await tx
        .insert(schema.clients)
        .values({
          type: business ? 'company' : 'individual',
          legalName: business ? `DEMO — ${names[i]} Distribution SARL` : null,
          firstName: business ? null : 'DEMO',
          lastName: business ? null : `Client ${i - 11}`,
          addressLine1: `${i + 1}, rue fictive de démonstration`,
          city: cities[i % cities.length],
          deliveryAddressLine1: `${i + 1}, entrepôt fictif`,
          deliveryCity: cities[i % cities.length],
          deliveryCountryCode: 'MA',
          notes: marker,
          email: null,
          phone: null,
          createdAt: timestamp(dateFor(i, 20)),
          createdByUserId: actor,
          updatedByUserId: actor,
        })
        .returning()
      ids.clients.push(client.id)
    }
    const themes = ['classic', 'modern', 'atelier', 'essential']
    for (let i = 0; i < 4; i++) {
      const [template] = await tx
        .insert(schema.documentTemplates)
        .values({
          name: `DEMO — ${themes[i]}`,
          layout: themes[i],
          density: i === 3 ? 'compact' : 'standard',
          accentColor: '#ad7d1d',
          footerText: marker,
          paymentTerms: 'Démonstration uniquement',
          showBankDetails: false,
          createdByUserId: actor,
          updatedByUserId: actor,
        })
        .returning()
      ids.templates.push(template.id)
    }
    for (let i = 0; i < 2; i++) {
      const [bank] = await tx
        .insert(schema.bankAccounts)
        .values({
          name: `DEMO — Compte ${i + 1}`,
          bankName: 'Banque fictive DEMO',
          accountHolder: 'DEMO — Slama Agricole',
          rib: String(i + 1).padStart(24, '0'),
          createdByUserId: actor,
          updatedByUserId: actor,
        })
        .returning()
      ids.bankAccounts.push(bank.id)
    }
    // Backdating/prefixes are fixture metadata only. Totals, conversions, revisions and
    // payment balances are produced by the same services as normal application requests.
    async function stamp(table, row, date, prefix, extra = {}) {
      await tx
        .update(table)
        .set({
          createdAt: timestamp(date),
          updatedAt: timestamp(date),
          ...(row.number
            ? {
                number: `${prefix === 'PAY' ? 'PAY-DEMO' : `DEMO-${prefix}`}-${date.slice(0, 4)}-${row.id.slice(0, 8).toUpperCase()}`,
              }
            : {}),
          ...extra,
        })
        .where(eq(table.id, row.id))
    }
    const baseEstimates = []
    for (let i = 0; i < 36; i++) {
      const date = dateFor(i, 36)
      let row = await estimates.create(
        {
          clientId: ids.clients[i % 18],
          templateId: ids.templates[i % 4],
          issueDate: date,
          validUntil: plus(date, 15),
          notes: marker,
          paymentTerms: 'Démonstration uniquement',
          lines: linesFor(i),
        },
        actor,
      )
      const state =
        i < 12
          ? 'accepted'
          : i < 16
            ? 'issued'
            : ['draft', 'issued', 'rejected', 'expired', 'cancelled'][i % 5]
      if (state !== 'draft') row = await estimates.issue(row.id, row.version, actor)
      if (state === 'accepted') row = await estimates.accept(row.id, row.version, actor)
      if (state === 'rejected') row = await estimates.reject(row.id, row.version, actor)
      if (state === 'cancelled') row = await estimates.cancel(row.id, row.version, actor, marker)
      await stamp(schema.estimates, row, date, 'DEV', {
        issuedAt: state === 'draft' ? null : timestamp(date),
        acceptedAt: state === 'accepted' ? timestamp(plus(date, 1)) : null,
        rejectedAt: state === 'rejected' ? timestamp(plus(date, 1)) : null,
        cancelledAt: state === 'cancelled' ? timestamp(plus(date, 1)) : null,
        ...(state === 'expired' ? { status: 'expired', expiredAt: timestamp(plus(date, 16)) } : {}),
      })
      ids.estimates.push(row.id)
      baseEstimates.push(await estimates.get(row.id))
    }
    for (let i = 12; i < 16; i++) {
      const source = baseEstimates[i]
      let revision = await estimates.createRevision(source.id, source.version, actor)
      if (i < 14) revision = await estimates.issue(revision.id, revision.version, actor)
      await stamp(schema.estimates, revision, plus(source.issueDate, 2), 'DEV', {
        issuedAt: i < 14 ? timestamp(plus(source.issueDate, 2)) : null,
      })
      ids.estimates.push(revision.id)
    }
    const independentDeliveries = []
    for (let i = 0; i < 10; i++) {
      const date = dateFor(i, 10)
      let row = await deliveries.create(
        {
          clientId: ids.clients[i],
          invoiceId: null,
          deliveryDate: date,
          deliveryAddress: `${i + 1}, entrepôt fictif, ${cities[i % cities.length]}`,
          instructions: marker,
          includeReceptionSignature: true,
          lines: linesFor(i).map(({ productVariantId, quantity }) => ({
            productVariantId,
            quantity,
            productName: '',
            sourceInvoiceLineId: null,
          })),
        },
        actor,
      )
      row = await deliveries.prepare(row.id, row.version, actor)
      row = await deliveries.deliver(row.id, row.version, actor)
      await stamp(schema.deliveryNotes, row, date, 'BL', { deliveredAt: timestamp(date) })
      ids.deliveryNotes.push(row.id)
      independentDeliveries.push(await deliveries.get(row.id))
    }
    const invoiceRows = []
    for (let i = 0; i < 60; i++) {
      let date = dateFor(i, i < 50 ? 50 : 60)
      if (i < 24 && date <= baseEstimates[i % 12].issueDate)
        date = plus(baseEstimates[i % 12].issueDate, 2)
      let row
      if (i < 24)
        row = await invoices.fromEstimate(
          baseEstimates[i % 12].id,
          { operationId: randomUUID(), dueDate: null },
          actor,
        )
      else if (i < 29) {
        const note = independentDeliveries[i - 24]
        row = await invoices.fromDeliveries(
          {
            operationId: randomUUID(),
            templateId: ids.templates[i % 4],
            issueDate: date,
            dueDate: plus(date, 15),
            notes: marker,
            paymentTerms: 'Démonstration uniquement',
            lines: note.lines.map((line, p) => ({
              deliveryNoteLineId: line.id,
              quantity: line.quantity,
              unitPrice: variants[p % variants.length].price,
              vatRate: null,
            })),
          },
          actor,
        )
      } else
        row = await invoices.create(
          {
            clientId: ids.clients[i % 18],
            templateId: ids.templates[i % 4],
            issueDate: date,
            dueDate: plus(date, 15),
            notes: marker,
            paymentTerms: 'Démonstration uniquement',
            lines: linesFor(i),
          },
          actor,
        )
      await tx
        .update(schema.invoices)
        .set({ issueDate: date, dueDate: plus(date, 15) })
        .where(eq(schema.invoices.id, row.id))
      if (i < 54) row = await invoices.issue(row.id, row.version, actor)
      if (i >= 50 && i < 54) row = await invoices.cancel(row.id, row.version, actor, marker)
      await stamp(schema.invoices, row, date, 'FAC', {
        issuedAt: i < 54 ? timestamp(date) : null,
        cancelledAt: i >= 50 && i < 54 ? timestamp(plus(date, 1)) : null,
      })
      ids.invoices.push(row.id)
      invoiceRows.push(await invoices.get(row.id))
    }
    let paymentIndex = 0
    for (let i = 0; i < 45; i++) {
      // Interleave paid/partial/unpaid examples across the year, not one block per status.
      const invoice = invoiceRows[(i * 7) % 50]
      const count = i < 30 ? 2 : 1
      const firstAmount = new Decimal(invoice.total).dividedBy(2).toDecimalPlaces(2)
      for (let p = 0; p < count; p++) {
        const method = ['cash', 'bank_transfer', 'cheque'][paymentIndex % 3]
        const pending = i >= 40 || method === 'cheque'
        const date = plus(invoice.issueDate, p + 1)
        let row = await payments.create(
          {
            operationId: randomUUID(),
            invoiceId: invoice.id,
            amount: (p === 0 ? firstAmount : new Decimal(invoice.total).minus(firstAmount)).toFixed(
              2,
            ),
            currency: 'MAD',
            method: i >= 40 ? 'cheque' : method,
            status: pending ? 'pending' : 'confirmed',
            paymentDate: date,
            collectedOn: pending ? null : date,
            bankAccountId: method === 'cash' && i < 40 ? null : ids.bankAccounts[i % 2],
            reference:
              method === 'bank_transfer' && i < 40 ? `DEMO-TRANSFER-${paymentIndex}` : null,
            chequeBank: method === 'cheque' || i >= 40 ? 'Banque fictive DEMO' : null,
            chequeNumber: method === 'cheque' || i >= 40 ? `DEMO-CHEQUE-${paymentIndex}` : null,
          },
          actor,
        )
        if (pending && i < 40) row = await payments.confirm(row.id, row.version, date, actor)
        if (i >= 43) row = await payments.cancel(row.id, row.version, marker, actor)
        await stamp(schema.payments, row, date, 'PAY', {
          confirmedAt: row.status === 'confirmed' ? timestamp(date) : null,
          cancelledAt: row.status === 'cancelled' ? timestamp(date) : null,
        })
        ids.payments.push(row.id)
        paymentIndex++
      }
    }
    for (let i = 0; i < 20; i++) {
      const invoice = invoiceRows[i]
      const date = plus(invoice.issueDate, 2)
      let row = await deliveries.create(
        {
          clientId: invoice.clientId,
          invoiceId: invoice.id,
          deliveryDate: date,
          deliveryAddress: 'Entrepôt fictif de démonstration',
          instructions: marker,
          includeReceptionSignature: true,
          lines: invoice.lines.map((line) => ({
            sourceInvoiceLineId: line.id,
            productVariantId: line.productVariantId,
            productName: line.productName,
            quantity: Math.max(1, Math.floor(line.quantity / 2)),
          })),
        },
        actor,
      )
      if (i % 4 !== 0) row = await deliveries.prepare(row.id, row.version, actor)
      if (i % 4 >= 2) row = await deliveries.deliver(row.id, row.version, actor)
      if (i % 4 === 3)
        row = await deliveries.acknowledge(row.id, row.version, 'Réceptionnaire DEMO', actor)
      await stamp(schema.deliveryNotes, row, date, 'BL', {
        deliveredAt: i % 4 >= 2 ? timestamp(date) : null,
        acknowledgedAt: i % 4 === 3 ? timestamp(date) : null,
      })
      ids.deliveryNotes.push(row.id)
    }
    await tx.insert(schema.auditEvents).values({
      actorKind: 'system',
      action: 'seed',
      entityTable: 'demo_seed',
      entityKey: { name: seedName },
      afterValues: { ids, capturedOn: now.toISOString(), warning: marker },
      reason: marker,
    })
    return true
  })
}
