import { randomInt } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'

import { EstimateLineSchema } from '../../../../contracts/generated/sales/estimates.schemas.js'
import {
  type DeliveryInvoiceConversion,
  type InvoiceConversion,
  type InvoiceInput,
  InvoicePageSchema,
  InvoiceSchema,
  type InvoiceUpdate,
} from '../../../../contracts/generated/sales/invoices.schemas.js'
import type { Transaction } from '../../../../lib/db.js'
import { AppError } from '../../../../lib/errors.js'
import { resolveLocale } from '../../../../lib/language.js'
import { assertVersion, companyDate, FinancialDecimal } from '../../../../lib/validation.js'
import type { createArtifactSupport } from '../../../../support/artifacts/index.js'
import type { createJobSupport } from '../../../../support/jobs/index.js'
import { clientSnapshot } from '../../shared/services/client-snapshot.js'
import type { createInvoiceRepository, InvoiceRow } from '../repositories/invoice.repository.js'

type Repository = ReturnType<typeof createInvoiceRepository>
type Jobs = ReturnType<typeof createJobSupport>
type Artifacts = ReturnType<typeof createArtifactSupport>['service']
const money = (value: InstanceType<typeof FinancialDecimal>) => value.toDecimalPlaces(2).toFixed(2)
const dto = <T>(schema: { parse(value: unknown): T }, value: unknown): T =>
  schema.parse(JSON.parse(JSON.stringify(value)))

export function createInvoiceService(
  repo: Repository,
  jobs: Jobs,
  artifacts: Artifacts,
  onNotificationChange?: (tx: Transaction) => Promise<void>,
) {
  async function output(
    row: InvoiceRow,
    tx?: Transaction,
    prefetchedBalances?: Awaited<ReturnType<Repository['balances']>>,
  ) {
    const [lines, deliveryNotes, balances, clientDisplayName, sourceEstimateNumber] =
      await Promise.all([
        repo.lines(row.id, tx),
        repo.relatedDeliveryNotes(row.id, tx),
        prefetchedBalances ?? repo.balances([row.id], tx),
        repo.clientDisplayName(row.clientId, tx),
        repo.sourceEstimateNumber(row.sourceEstimateId, tx),
      ])
    return dto(InvoiceSchema.strip(), {
      ...row,
      locale:
        row.status === 'draft'
          ? resolveLocale(
              row.localeOverride,
              (await (tx ? repo.company(tx) : repo.transaction((inner) => repo.company(inner))))
                .locale,
            )
          : row.locale,
      clientDisplayName,
      sourceEstimateNumber,
      deliveryNoteIds: deliveryNotes.map((note) => note.id),
      deliveryNotes,
      ...balances.get(row.id),
      lines: lines.map((line) => dto(EstimateLineSchema.strip(), line)),
    })
  }
  async function prepare(input: InvoiceInput, actor: string, tx: Transaction) {
    if (input.dueDate && input.dueDate < input.issueDate)
      throw new AppError(400, 'INVALID_DATE', 'Due date must not precede the issue date.')
    const client = await repo.client(input.clientId, tx)
    const company = await repo.company(tx)
    const template = await repo.template(input.templateId, tx)
    let subtotal = new FinancialDecimal(0)
    let taxTotal = new FinancialDecimal(0)
    const lines = []
    for (const [position, line] of input.lines.entries()) {
      const selected = line.productVariantId ? await repo.variant(line.productVariantId, tx) : null
      const price = new FinancialDecimal(line.unitPrice)
      const net = price.times(line.quantity).toDecimalPlaces(2)
      const vat = line.vatRate === null ? null : new FinancialDecimal(line.vatRate)
      const tax = vat ? net.times(vat).dividedBy(100).toDecimalPlaces(2) : new FinancialDecimal(0)
      subtotal = subtotal.plus(net)
      taxTotal = taxTotal.plus(tax)
      lines.push({
        position,
        productId: selected?.product.id ?? null,
        productVariantId: line.productVariantId,
        productName: selected?.product.name ?? line.productName.trim(),
        productReference: selected?.product.reference ?? null,
        packageWeightG: selected?.variant.weightG ?? null,
        quantity: line.quantity,
        unitPrice: money(price),
        vatRate: vat?.toFixed(2) ?? null,
        netAmount: money(net),
        taxAmount: money(tax),
        totalAmount: money(net.plus(tax)),
        createdByUserId: actor,
        updatedByUserId: actor,
      })
    }
    return {
      header: {
        clientId: client.id,
        templateId: template?.id ?? null,
        issueDate: input.issueDate,
        dueDate: input.dueDate,
        currency: company.currency,
        locale: resolveLocale(input.localeOverride, company.locale),
        localeOverride: input.localeOverride ?? null,
        issuerSnapshot: {
          locale: resolveLocale(input.localeOverride, company.locale),
          legalName: company.legalName,
          tradeName: company.tradeName,
          legalForm: company.legalForm,
          shareCapital: company.shareCapital,
          addressLine1: company.addressLine1,
          addressLine2: company.addressLine2,
          city: company.city,
          postalCode: company.postalCode,
          countryCode: company.countryCode,
          ice: company.ice,
          taxIdentifier: company.taxIdentifier,
          registrationNumber: company.registrationNumber,
          registrationCity: company.registrationCity,
          professionalTaxNumber: company.professionalTaxNumber,
          email: company.email,
          phone: company.phone,
        },
        clientSnapshot: {
          type: client.type,
          firstName: client.firstName,
          lastName: client.lastName,
          legalName: client.legalName,
          tradeName: client.tradeName,
          addressLine1: client.addressLine1,
          addressLine2: client.addressLine2,
          city: client.city,
          postalCode: client.postalCode,
          countryCode: client.countryCode,
          ice: client.ice,
          taxIdentifier: client.taxIdentifier,
          registrationNumber: client.registrationNumber,
          registrationCity: client.registrationCity,
          professionalTaxNumber: client.professionalTaxNumber,
          email: client.email,
          phone: client.phone,
        },
        appearanceSnapshot: {
          layout: template?.layout ?? 'classic',
          density: template?.density ?? 'standard',
          accentColor: template?.accentColor ?? '#ad7d1d',
          logoAssetId: template?.logoAssetId ?? company.logoAssetId,
          signatureAssetId: template?.signatureAssetId ?? null,
          showBankDetails: template?.showBankDetails ?? false,
          showSignature: template?.showSignature ?? false,
          showPaymentTerms: template?.showPaymentTerms ?? true,
          footerText: template?.footerText ?? null,
        },
        bankDetailsSnapshot: null,
        notes: input.notes?.trim() || null,
        paymentTerms: input.paymentTerms?.trim() || null,
        subtotal: money(subtotal),
        taxTotal: money(taxTotal),
        total: money(subtotal.plus(taxTotal)),
      },
      lines,
    }
  }
  return {
    async list(filters: Parameters<Repository['list']>[0]) {
      if (filters.dateFrom && filters.dateTo && filters.dateFrom > filters.dateTo)
        throw new AppError(400, 'INVALID_DATE_RANGE', 'Start date must not follow end date.')
      if (
        filters.amountMin &&
        filters.amountMax &&
        new FinancialDecimal(filters.amountMin).gt(filters.amountMax)
      )
        throw new AppError(
          400,
          'INVALID_AMOUNT_RANGE',
          'Minimum amount must not exceed maximum amount.',
        )
      const page = await repo.list(filters)
      const balances = await repo.balances(page.items.map((row) => row.id))
      return dto(InvoicePageSchema, {
        ...page,
        limit: filters.limit,
        offset: filters.offset,
        items: await Promise.all(page.items.map((row) => output(row, undefined, balances))),
      })
    },
    async get(id: string) {
      return output(await repo.one(id))
    },
    fromDeliveries(input: DeliveryInvoiceConversion, actor: string) {
      return repo.transaction(async (tx) => {
        await repo.authorize(tx, actor, 'delivery_notes.read')
        await repo.authorize(tx, actor, 'invoices.create')
        const existing = await repo.byOperation(input.operationId, tx)
        if (existing) {
          if (existing.sourceEstimateId || !isDeepStrictEqual(existing.conversionRequest, input))
            throw new AppError(
              409,
              'CONVERSION_CONFLICT',
              'This operation ID was used for another invoice request.',
            )
          return output(existing, tx)
        }
        const ids = input.lines.map((line) => line.deliveryNoteLineId)
        if (new Set(ids).size !== ids.length)
          throw new AppError(400, 'DUPLICATE_DELIVERY_LINE', 'Select each delivery line only once.')
        const sources = new Map<string, Awaited<ReturnType<typeof repo.deliveryLine>>>()
        for (const id of [...ids].sort()) sources.set(id, await repo.deliveryLine(id, tx))
        const clientIds = new Set([...sources.values()].map(({ note }) => note.clientId))
        if (clientIds.size !== 1)
          throw new AppError(
            400,
            'CLIENT_MISMATCH',
            'All deliveries must belong to the same client.',
          )
        for (const line of input.lines) {
          const source = sources.get(line.deliveryNoteLineId)!
          const allocated = await repo.allocatedQuantity(line.deliveryNoteLineId, tx)
          if (allocated + line.quantity > source.line.quantity)
            throw new AppError(
              409,
              'OVER_BILLING',
              'Requested quantity exceeds unbilled delivered quantity.',
            )
        }
        const prepared = await prepare(
          {
            clientId: [...clientIds][0]!,
            templateId: input.templateId,
            issueDate: input.issueDate,
            dueDate: input.dueDate,
            notes: input.notes,
            paymentTerms: input.paymentTerms,
            lines: input.lines.map((line) => ({
              productVariantId: null,
              productName: sources.get(line.deliveryNoteLineId)!.line.productName,
              quantity: line.quantity,
              unitPrice: line.unitPrice,
              vatRate: line.vatRate,
            })),
          },
          actor,
          tx,
        )
        const row = await repo.insert(
          {
            ...prepared.header,
            conversionOperationId: input.operationId,
            conversionRequest: input,
            createdByUserId: actor,
            updatedByUserId: actor,
          },
          tx,
        )
        await repo.replaceLines(
          row.id,
          prepared.lines.map((line, position) => ({
            ...line,
            productId: sources.get(input.lines[position]!.deliveryNoteLineId)!.line.productId,
            productVariantId: sources.get(input.lines[position]!.deliveryNoteLineId)!.line
              .productVariantId,
            productReference: sources.get(input.lines[position]!.deliveryNoteLineId)!.line
              .productReference,
            packageWeightG: sources.get(input.lines[position]!.deliveryNoteLineId)!.line
              .packageWeightG,
            invoiceId: row.id,
          })),
          tx,
        )
        const savedLines = await repo.lines(row.id, tx)
        for (const [position, line] of input.lines.entries())
          await repo.allocate(savedLines[position]!.id, line.deliveryNoteLineId, line.quantity, tx)
        const result = await output(row, tx)
        await repo.audit(tx, actor, 'from_deliveries', row.id, null, result)
        return result
      })
    },
    create(input: InvoiceInput, actor: string) {
      return repo.transaction(async (tx) => {
        await repo.authorize(tx, actor, 'invoices.create')
        const prepared = await prepare(input, actor, tx)
        const row = await repo.insert(
          { ...prepared.header, createdByUserId: actor, updatedByUserId: actor },
          tx,
        )
        await repo.replaceLines(
          row.id,
          prepared.lines.map((line) => ({ ...line, invoiceId: row.id })),
          tx,
        )
        const result = await output(row, tx)
        await repo.audit(tx, actor, 'create', row.id, null, result)
        return result
      })
    },
    update(id: string, input: InvoiceUpdate, actor: string) {
      return repo.transaction(async (tx) => {
        await repo.authorize(tx, actor, 'invoices.update')
        const before = await repo.one(id, tx, true)
        assertVersion(before.version, input.expectedVersion)
        if (before.status !== 'draft')
          throw new AppError(409, 'INVALID_STATUS', 'Only drafts can be edited.')
        if (await repo.hasAllocations(id, tx))
          throw new AppError(
            409,
            'DELIVERY_ALLOCATED',
            'Delivery-derived invoices cannot be edited after allocation.',
          )
        if (before.sourceEstimateId && before.clientId !== input.clientId)
          throw new AppError(
            409,
            'SOURCE_CLIENT_MISMATCH',
            'Converted invoice must keep the estimate client.',
          )
        const previous = await output(before, tx)
        const prepared = await prepare(input, actor, tx)
        if (before.sourceEstimateId && prepared.header.currency !== before.currency)
          throw new AppError(
            409,
            'SOURCE_CURRENCY_MISMATCH',
            'Converted invoice must keep the estimate currency.',
          )
        const row = await repo.update(id, { ...prepared.header, updatedByUserId: actor }, tx, true)
        await repo.replaceLines(
          id,
          prepared.lines.map((line) => ({ ...line, invoiceId: id })),
          tx,
        )
        const result = await output(row, tx)
        await repo.audit(tx, actor, 'update', id, previous, result)
        return result
      })
    },
    delete(id: string, expectedVersion: number, actor: string) {
      return repo.transaction(async (tx) => {
        await repo.authorize(tx, actor, 'invoices.delete')
        const row = await repo.one(id, tx, true)
        assertVersion(row.version, expectedVersion)
        if (row.status !== 'draft')
          throw new AppError(409, 'INVALID_STATUS', 'Only drafts can be deleted.')
        await repo.delete(id, tx)
        await repo.audit(tx, actor, 'delete', id, row, row)
      })
    },
    issue(id: string, expectedVersion: number, actor: string) {
      return repo.transaction(async (tx) => {
        await repo.authorize(tx, actor, 'invoices.update')
        const before = await repo.one(id, tx, true)
        assertVersion(before.version, expectedVersion)
        if (before.status !== 'draft')
          throw new AppError(409, 'INVALID_STATUS', 'Invoice is already issued.')
        if (!before.dueDate || before.dueDate < before.issueDate)
          throw new AppError(400, 'INVALID_DATE', 'A due date is required before issuing.')
        if (!(await repo.lines(id, tx)).length)
          throw new AppError(400, 'EMPTY_INVOICE', 'Add at least one product before issuing.')
        const issuedLocale = resolveLocale(before.localeOverride, (await repo.company(tx)).locale)
        const currentClientSnapshot = clientSnapshot(await repo.client(before.clientId, tx))
        const year = new Intl.DateTimeFormat('en', {
          year: 'numeric',
          timeZone: 'Africa/Casablanca',
        }).format(new Date())
        let row: InvoiceRow | undefined
        for (let attempt = 0; attempt < 5; attempt++) {
          const number = `FAC-${year}-${randomInt(0, 10_000_000_000).toString().padStart(10, '0')}`
          try {
            row = await tx.transaction((savepoint) =>
              repo.update(
                id,
                {
                  status: 'issued',
                  locale: issuedLocale,
                  issuerSnapshot: {
                    ...(before.issuerSnapshot as Record<string, unknown>),
                    locale: issuedLocale,
                  },
                  number,
                  issuedAt: new Date(),
                  updatedByUserId: actor,
                  clientSnapshot: currentClientSnapshot,
                },
                savepoint,
                true,
              ),
            )
            break
          } catch (error) {
            if ((error as { code?: string }).code !== '23505') throw error
          }
        }
        if (!row)
          throw new AppError(409, 'NUMBER_COLLISION', 'Could not assign a unique invoice number.')
        await jobs.enqueuePdfInTransaction(
          tx,
          { documentType: 'invoice', documentId: id, sourceVersion: row.contentVersion },
          actor,
        )
        await repo.audit(tx, actor, 'issue', id, before, row)
        return output(row, tx)
      })
    },
    cancel(id: string, expectedVersion: number, actor: string, reason: string) {
      return repo.transaction(async (tx) => {
        await repo.authorize(tx, actor, 'invoices.update')
        const before = await repo.one(id, tx, true)
        assertVersion(before.version, expectedVersion)
        if (!['issued', 'sent'].includes(before.status))
          throw new AppError(409, 'INVALID_STATUS', 'Only issued invoices can be cancelled.')
        if (!reason.trim())
          throw new AppError(400, 'CANCELLATION_REASON_REQUIRED', 'Enter a cancellation reason.')
        if (await repo.hasAllocations(id, tx))
          throw new AppError(
            409,
            'DELIVERY_ALLOCATED',
            'Resolve delivered-product billing before cancelling the invoice.',
          )
        if (await repo.hasActiveDeliveries(id, tx))
          throw new AppError(
            409,
            'ACTIVE_DELIVERY_NOTES',
            'Cancel linked delivery notes before cancelling the invoice.',
          )
        if (await repo.hasActivePayments(id, tx))
          throw new AppError(
            409,
            'INVOICE_HAS_PAYMENTS',
            'Cancel or remove payments before cancelling the invoice.',
          )
        const row = await repo.update(
          id,
          {
            status: 'cancelled',
            cancelledAt: new Date(),
            cancellationReason: reason.trim(),
            updatedByUserId: actor,
          },
          tx,
        )
        await repo.audit(tx, actor, 'cancel', id, before, row)
        await onNotificationChange?.(tx)
        return output(row, tx)
      })
    },
    async preparePdf(id: string, actor: string) {
      const row = await repo.transaction(async (tx) => {
        await repo.authorize(tx, actor, 'invoices.read')
        return repo.one(id, tx)
      })
      if (row.status === 'draft')
        throw new AppError(409, 'DRAFT_NOT_PRINTABLE', 'Issue the invoice first.')
      const job = await jobs.enqueuePdf(
        { documentType: 'invoice', documentId: id, sourceVersion: row.contentVersion },
        actor,
      )
      return { jobId: job.id, status: job.status }
    },
    async artifacts(id: string, actor: string) {
      await repo.transaction(async (tx) => {
        await repo.authorize(tx, actor, 'invoices.read')
        await repo.one(id, tx)
      })
      return (await artifacts.list('invoice', id, actor)).map(
        ({ id, sourceVersion, format, byteSize, generatedAt }) => ({
          id,
          sourceVersion,
          format,
          byteSize,
          generatedAt: generatedAt.toISOString(),
        }),
      )
    },
    fromEstimate(id: string, input: InvoiceConversion, actor: string) {
      return repo.transaction(async (tx) => {
        await repo.authorize(tx, actor, 'estimates.read')
        await repo.authorize(tx, actor, 'invoices.create')
        const existing = await repo.byOperation(input.operationId, tx)
        if (existing) {
          const request = existing.conversionRequest as InvoiceConversion | null
          if (existing.sourceEstimateId !== id || request?.dueDate !== input.dueDate)
            throw new AppError(
              409,
              'CONVERSION_CONFLICT',
              'This operation ID was used for another invoice request.',
            )
          return output(existing, tx)
        }
        const estimate = await repo.sourceEstimate(id, tx)
        if (estimate.status !== 'accepted')
          throw new AppError(
            409,
            'ESTIMATE_NOT_ACCEPTED',
            'Only accepted estimates can be converted.',
          )
        const lines = await repo.estimateLines(id, tx)
        const company = await repo.company(tx)
        const issueDate = companyDate(new Date(), company.timezone)
        const fallbackDueDate = new Date(`${issueDate}T12:00:00Z`)
        fallbackDueDate.setUTCDate(fallbackDueDate.getUTCDate() + company.paymentDueDays)
        const dueDate = input.dueDate ?? fallbackDueDate.toISOString().slice(0, 10)
        if (dueDate < issueDate)
          throw new AppError(400, 'INVALID_DATE', 'Due date must not precede the invoice date.')
        const row = await repo.insert(
          {
            clientId: estimate.clientId,
            templateId: estimate.templateId,
            sourceEstimateId: id,
            conversionOperationId: input.operationId,
            conversionRequest: input,
            issueDate,
            dueDate,
            currency: estimate.currency,
            locale: estimate.locale,
            localeOverride: estimate.locale,
            issuerSnapshot: estimate.issuerSnapshot,
            clientSnapshot: clientSnapshot(await repo.client(estimate.clientId, tx)),
            appearanceSnapshot: estimate.appearanceSnapshot,
            bankDetailsSnapshot: estimate.bankDetailsSnapshot,
            notes: estimate.notes,
            paymentTerms: estimate.paymentTerms,
            subtotal: estimate.subtotal,
            taxTotal: estimate.taxTotal,
            total: estimate.total,
            createdByUserId: actor,
            updatedByUserId: actor,
          },
          tx,
        )
        await repo.replaceLines(
          row.id,
          lines.map((line) => ({
            invoiceId: row.id,
            position: line.position,
            productId: line.productId,
            productVariantId: line.productVariantId,
            productName: line.productName,
            productReference: line.productReference,
            packageWeightG: line.packageWeightG,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            vatRate: line.vatRate,
            netAmount: line.netAmount,
            taxAmount: line.taxAmount,
            totalAmount: line.totalAmount,
            createdByUserId: actor,
            updatedByUserId: actor,
          })),
          tx,
        )
        const result = await output(row, tx)
        await repo.audit(tx, actor, 'convert_from_estimate', row.id, null, result)
        return result
      })
    },
    async linkedToEstimate(id: string, actor: string) {
      return repo.transaction(async (tx) => {
        await repo.authorize(tx, actor, 'estimates.read')
        await repo.authorize(tx, actor, 'invoices.read')
        await repo.sourceEstimate(id, tx)
        return Promise.all((await repo.linked(id, tx)).map((row) => output(row, tx)))
      })
    },
  }
}

export function createInvoiceOwnerAccess(repo: Repository) {
  return {
    async assertPublishable(tx: Transaction, id: string, version: number) {
      const row = await repo.one(id, tx, true)
      if (row.status === 'draft' || row.contentVersion !== version)
        throw new AppError(409, 'DOCUMENT_CHANGED', 'Invoice is not printable at this version.')
    },
    async assertReadable(tx: Transaction, id: string, actor: string) {
      await repo.authorize(tx, actor, 'invoices.read')
      await repo.one(id, tx)
    },
  }
}
