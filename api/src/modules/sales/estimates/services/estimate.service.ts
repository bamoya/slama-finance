import { randomInt } from 'node:crypto'

import {
  type EstimateInput,
  EstimatePageSchema,
  EstimateSchema,
  type EstimateUpdate,
} from '../../../../contracts/generated/sales/estimates.schemas.js'
import type { Transaction } from '../../../../lib/db.js'
import { AppError } from '../../../../lib/errors.js'
import { resolveLocale } from '../../../../lib/language.js'
import { assertVersion, FinancialDecimal } from '../../../../lib/validation.js'
import type { createArtifactSupport } from '../../../../support/artifacts/index.js'
import type { createJobSupport } from '../../../../support/jobs/index.js'
import { clientSnapshot as snapshotClient } from '../../shared/services/client-snapshot.js'
import type { createEstimateRepository, EstimateRow } from '../repositories/estimate.repository.js'

type Repository = ReturnType<typeof createEstimateRepository>
type Jobs = ReturnType<typeof createJobSupport>
type Artifacts = ReturnType<typeof createArtifactSupport>['service']
const money = (value: InstanceType<typeof FinancialDecimal>) => value.toDecimalPlaces(2).toFixed(2)
const dto = <T>(schema: { parse(value: unknown): T }, value: unknown): T =>
  schema.parse(JSON.parse(JSON.stringify(value)))

export function createEstimateService(
  repo: Repository,
  jobs: Jobs,
  artifacts: Artifacts,
  onNotificationChange?: (tx: Transaction) => Promise<void>,
) {
  async function output(row: EstimateRow, tx?: Transaction) {
    const [lines, clientDisplayName] = await Promise.all([
      repo.lines(row.id, tx),
      repo.clientDisplayName(row.clientId, tx),
    ])
    return dto(EstimateSchema, {
      id: row.id,
      number: row.number,
      status: row.status,
      revisionOfId: row.revisionOfId,
      revisionId: (await repo.revision(row.id, tx))?.id ?? null,
      clientId: row.clientId,
      clientDisplayName,
      templateId: row.templateId,
      issueDate: row.issueDate,
      validUntil: row.validUntil,
      currency: row.currency,
      locale:
        row.status === 'draft'
          ? resolveLocale(
              row.localeOverride,
              (await (tx ? repo.company(tx) : repo.transaction((inner) => repo.company(inner))))
                .locale,
            )
          : row.locale,
      localeOverride: row.localeOverride,
      notes: row.notes,
      paymentTerms: row.paymentTerms,
      subtotal: row.subtotal,
      taxTotal: row.taxTotal,
      total: row.total,
      version: row.version,
      contentVersion: row.contentVersion,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      lines: lines.map((line) => ({
        id: line.id,
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
      })),
    })
  }
  async function prepare(input: EstimateInput, actor: string, tx: Transaction) {
    if (input.validUntil && input.validUntil < input.issueDate)
      throw new AppError(400, 'INVALID_DATE', 'Valid-until date must not precede the issue date.')
    const client = await repo.client(input.clientId, tx)
    const company = await repo.company(tx)
    const template = await repo.template(input.templateId, tx)
    const preparedLines = []
    let subtotal = new FinancialDecimal(0)
    let taxTotal = new FinancialDecimal(0)
    for (const [position, line] of input.lines.entries()) {
      const selected = line.productVariantId ? await repo.variant(line.productVariantId, tx) : null
      const unitPrice = new FinancialDecimal(line.unitPrice)
      const net = unitPrice.times(line.quantity).toDecimalPlaces(2)
      const vatRate = line.vatRate === null ? null : new FinancialDecimal(line.vatRate)
      const tax = vatRate
        ? net.times(vatRate).dividedBy(100).toDecimalPlaces(2)
        : new FinancialDecimal(0)
      subtotal = subtotal.plus(net)
      taxTotal = taxTotal.plus(tax)
      preparedLines.push({
        position,
        productId: selected?.product.id ?? null,
        productVariantId: line.productVariantId,
        productName: selected?.product.name ?? line.productName.trim(),
        productReference: selected?.product.reference ?? null,
        packageWeightG: selected?.variant.weightG ?? null,
        quantity: line.quantity,
        unitPrice: money(unitPrice),
        vatRate: vatRate?.toFixed(2) ?? null,
        netAmount: money(net),
        taxAmount: money(tax),
        totalAmount: money(net.plus(tax)),
        createdByUserId: actor,
        updatedByUserId: actor,
      })
    }
    const issuerSnapshot = {
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
    }
    const clientSnapshot = {
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
    }
    const appearanceSnapshot = {
      layout: template?.layout ?? 'classic',
      density: template?.density ?? 'standard',
      accentColor: template?.accentColor ?? '#ad7d1d',
      logoAssetId: template?.logoAssetId ?? company.logoAssetId,
      signatureAssetId: template?.signatureAssetId ?? null,
      showBankDetails: template?.showBankDetails ?? false,
      showSignature: template?.showSignature ?? false,
      showPaymentTerms: template?.showPaymentTerms ?? true,
      footerText: template?.footerText ?? null,
    }
    return {
      header: {
        clientId: client.id,
        templateId: template?.id ?? null,
        issueDate: input.issueDate,
        validUntil: input.validUntil,
        currency: company.currency,
        locale: resolveLocale(input.localeOverride, company.locale),
        localeOverride: input.localeOverride ?? null,
        issuerSnapshot,
        clientSnapshot,
        appearanceSnapshot,
        bankDetailsSnapshot: null,
        notes: input.notes?.trim() || null,
        paymentTerms: input.paymentTerms?.trim() || null,
        subtotal: money(subtotal),
        taxTotal: money(taxTotal),
        total: money(subtotal.plus(taxTotal)),
      },
      lines: preparedLines,
    }
  }
  async function transition(
    id: string,
    expectedVersion: number,
    actor: string,
    next: 'accepted' | 'rejected' | 'cancelled',
    reason?: string,
  ) {
    return repo.transaction(async (tx) => {
      await repo.authorize(
        tx,
        actor,
        next === 'cancelled' ? 'estimates.update' : 'estimates.update',
      )
      const before = await repo.one(id, tx, true)
      assertVersion(before.version, expectedVersion)
      if (
        next === 'cancelled'
          ? !['issued', 'sent', 'accepted', 'rejected', 'expired'].includes(before.status)
          : !['issued', 'sent'].includes(before.status)
      )
        throw new AppError(409, 'INVALID_STATUS', 'Estimate cannot make this transition.')
      const now = new Date()
      const row = await repo.update(
        id,
        {
          status: next,
          ...(next === 'accepted'
            ? { acceptedAt: now }
            : next === 'rejected'
              ? { rejectedAt: now }
              : { cancelledAt: now, cancellationReason: reason }),
          updatedByUserId: actor,
        },
        tx,
      )
      await repo.audit(tx, actor, next, id, before, row)
      await onNotificationChange?.(tx)
      return output(row, tx)
    })
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
      return dto(EstimatePageSchema, {
        ...page,
        limit: filters.limit,
        offset: filters.offset,
        items: await Promise.all(page.items.map((row) => output(row))),
      })
    },
    async get(id: string) {
      return output(await repo.one(id))
    },
    createRevision(id: string, expectedVersion: number, actor: string) {
      return repo.transaction(async (tx) => {
        await repo.authorize(tx, actor, 'estimates.read')
        await repo.authorize(tx, actor, 'estimates.create')
        const source = await repo.one(id, tx, true)
        assertVersion(source.version, expectedVersion)
        if (!['issued', 'sent', 'accepted', 'rejected', 'expired'].includes(source.status))
          throw new AppError(
            409,
            'INVALID_STATUS',
            'Only a current finalized estimate can be revised.',
          )
        const existing = await repo.revision(id, tx)
        if (existing) return output(existing, tx)
        const row = await repo.insert(
          {
            revisionOfId: source.id,
            clientId: source.clientId,
            templateId: source.templateId,
            issueDate: source.issueDate,
            validUntil: source.validUntil,
            currency: source.currency,
            locale: source.locale,
            localeOverride: source.locale,
            issuerSnapshot: source.issuerSnapshot,
            clientSnapshot: snapshotClient(await repo.client(source.clientId, tx)),
            appearanceSnapshot: source.appearanceSnapshot,
            bankDetailsSnapshot: source.bankDetailsSnapshot,
            notes: source.notes,
            paymentTerms: source.paymentTerms,
            subtotal: source.subtotal,
            taxTotal: source.taxTotal,
            total: source.total,
            createdByUserId: actor,
            updatedByUserId: actor,
          },
          tx,
        )
        const lines = await repo.lines(source.id, tx)
        await repo.replaceLines(
          row.id,
          lines.map(({ id: _id, createdAt: _createdAt, updatedAt: _updatedAt, ...line }) => ({
            ...line,
            estimateId: row.id,
            createdByUserId: actor,
            updatedByUserId: actor,
          })),
          tx,
        )
        const result = await output(row, tx)
        await repo.audit(tx, actor, 'create_revision', row.id, null, result)
        return result
      })
    },
    create(input: EstimateInput, actor: string) {
      return repo.transaction(async (tx) => {
        await repo.authorize(tx, actor, 'estimates.create')
        const prepared = await prepare(input, actor, tx)
        const row = await repo.insert(
          { ...prepared.header, createdByUserId: actor, updatedByUserId: actor },
          tx,
        )
        await repo.replaceLines(
          row.id,
          prepared.lines.map((line) => ({ ...line, estimateId: row.id })),
          tx,
        )
        const result = await output(row, tx)
        await repo.audit(tx, actor, 'create', row.id, null, result)
        return result
      })
    },
    update(id: string, input: EstimateUpdate, actor: string) {
      return repo.transaction(async (tx) => {
        await repo.authorize(tx, actor, 'estimates.update')
        const before = await repo.one(id, tx, true)
        assertVersion(before.version, input.expectedVersion)
        if (before.status !== 'draft')
          throw new AppError(409, 'INVALID_STATUS', 'Only drafts can be edited.')
        if (before.revisionOfId && input.clientId !== before.clientId)
          throw new AppError(
            409,
            'REVISION_CLIENT_MISMATCH',
            'A revision must keep the original client.',
          )
        const previous = await output(before, tx)
        const prepared = await prepare(input, actor, tx)
        const row = await repo.update(id, { ...prepared.header, updatedByUserId: actor }, tx, true)
        await repo.replaceLines(
          id,
          prepared.lines.map((line) => ({ ...line, estimateId: id })),
          tx,
        )
        const result = await output(row, tx)
        await repo.audit(tx, actor, 'update', id, previous, result)
        return result
      })
    },
    delete(id: string, expectedVersion: number, actor: string) {
      return repo.transaction(async (tx) => {
        await repo.authorize(tx, actor, 'estimates.delete')
        const before = await repo.one(id, tx, true)
        assertVersion(before.version, expectedVersion)
        if (before.status !== 'draft')
          throw new AppError(409, 'INVALID_STATUS', 'Only drafts can be deleted.')
        await repo.delete(id, tx)
        await repo.audit(tx, actor, 'delete', id, before, before)
      })
    },
    issue(id: string, expectedVersion: number, actor: string) {
      return repo.transaction(async (tx) => {
        await repo.authorize(tx, actor, 'estimates.update')
        const before = await repo.one(id, tx, true)
        assertVersion(before.version, expectedVersion)
        if (before.status !== 'draft')
          throw new AppError(409, 'INVALID_STATUS', 'Estimate is already issued.')
        const predecessor = before.revisionOfId
          ? await repo.one(before.revisionOfId, tx, true)
          : null
        if (
          predecessor &&
          !['issued', 'sent', 'accepted', 'rejected', 'expired'].includes(predecessor.status)
        )
          throw new AppError(
            409,
            'REVISION_SOURCE_CHANGED',
            'The original estimate is no longer current. Delete this draft revision.',
          )
        if (!before.validUntil || before.validUntil < before.issueDate)
          throw new AppError(400, 'INVALID_DATE', 'A valid-until date is required before issuing.')
        if (!(await repo.lines(id, tx)).length)
          throw new AppError(400, 'EMPTY_ESTIMATE', 'Add at least one product before issuing.')
        const issuedLocale = resolveLocale(before.localeOverride, (await repo.company(tx)).locale)
        const currentClientSnapshot = snapshotClient(await repo.client(before.clientId, tx))
        const year = new Intl.DateTimeFormat('en', {
          year: 'numeric',
          timeZone: 'Africa/Casablanca',
        }).format(new Date())
        let row: EstimateRow | undefined
        for (let attempt = 0; attempt < 5; attempt++) {
          const number = `DEV-${year}-${randomInt(0, 10_000_000_000).toString().padStart(10, '0')}`
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
          throw new AppError(409, 'NUMBER_COLLISION', 'Could not assign a unique estimate number.')
        if (predecessor) {
          const superseded = await repo.update(
            predecessor.id,
            { status: 'superseded', updatedByUserId: actor },
            tx,
          )
          await repo.audit(tx, actor, 'supersede', predecessor.id, predecessor, superseded)
          await onNotificationChange?.(tx)
        }
        await jobs.enqueuePdfInTransaction(
          tx,
          { documentType: 'estimate', documentId: id, sourceVersion: row.contentVersion },
          actor,
        )
        await repo.audit(tx, actor, 'issue', id, before, row)
        return output(row, tx)
      })
    },
    accept: (id: string, version: number, actor: string) =>
      transition(id, version, actor, 'accepted'),
    reject: (id: string, version: number, actor: string) =>
      transition(id, version, actor, 'rejected'),
    cancel: (id: string, version: number, actor: string, reason: string) =>
      transition(id, version, actor, 'cancelled', reason.trim()),
    async preparePdf(id: string, actor: string) {
      const row = await repo.transaction(async (tx) => {
        await repo.authorize(tx, actor, 'estimates.read')
        return repo.one(id, tx)
      })
      if (row.status === 'draft')
        throw new AppError(409, 'DRAFT_NOT_PRINTABLE', 'Issue the estimate first.')
      const job = await jobs.enqueuePdf(
        { documentType: 'estimate', documentId: id, sourceVersion: row.contentVersion },
        actor,
      )
      return { jobId: job.id, status: job.status }
    },
    async artifacts(id: string, actor: string) {
      await repo.transaction(async (tx) => {
        await repo.authorize(tx, actor, 'estimates.read')
        await repo.one(id, tx)
      })
      const rows = await artifacts.list('estimate', id, actor)
      return rows.map(({ id, sourceVersion, format, byteSize, generatedAt }) => ({
        id,
        sourceVersion,
        format,
        byteSize,
        generatedAt: generatedAt.toISOString(),
      }))
    },
  }
}

export function createEstimateOwnerAccess(repo: Repository) {
  return {
    async assertPublishable(tx: Transaction, id: string, version: number) {
      const row = await repo.one(id, tx, true)
      if (row.status === 'draft' || row.contentVersion !== version)
        throw new AppError(409, 'DOCUMENT_CHANGED', 'Estimate is not printable at this version.')
    },
    async assertReadable(tx: Transaction, id: string, actor: string) {
      await repo.authorize(tx, actor, 'estimates.read')
      await repo.one(id, tx)
    },
  }
}
