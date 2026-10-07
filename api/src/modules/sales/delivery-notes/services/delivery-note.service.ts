import { randomInt } from 'node:crypto'

import {
  type DeliveryNoteInput,
  DeliveryNoteLineSchema,
  DeliveryNotePageSchema,
  DeliveryNoteSchema,
  type DeliveryNoteUpdate,
} from '../../../../contracts/generated/sales/delivery-notes.schemas.js'
import type { Transaction } from '../../../../lib/db.js'
import { AppError } from '../../../../lib/errors.js'
import { assertVersion } from '../../../../lib/validation.js'
import type { createArtifactSupport } from '../../../../support/artifacts/index.js'
import type { createJobSupport } from '../../../../support/jobs/index.js'
import { clientSnapshot } from '../../shared/services/client-snapshot.js'
import type {
  createDeliveryNoteRepository,
  DeliveryNoteRow,
} from '../repositories/delivery-note.repository.js'

type Repository = ReturnType<typeof createDeliveryNoteRepository>
type Jobs = ReturnType<typeof createJobSupport>
type Artifacts = ReturnType<typeof createArtifactSupport>['service']
const dto = <T>(schema: { parse(value: unknown): T }, value: unknown): T =>
  schema.parse(JSON.parse(JSON.stringify(value)))

export function createDeliveryNoteService(repo: Repository, jobs: Jobs, artifacts: Artifacts) {
  async function output(row: DeliveryNoteRow, tx?: Transaction) {
    const [lines, clientDisplayName, invoiceNumber, relatedInvoices] = await Promise.all([
      repo.lines(row.id, tx),
      repo.clientDisplayName(row.clientId, tx),
      repo.invoiceNumber(row.invoiceId, tx),
      repo.relatedInvoices(row.id, row.invoiceId, tx),
    ])
    return dto(DeliveryNoteSchema.strip(), {
      ...row,
      clientDisplayName,
      invoiceNumber,
      invoices: relatedInvoices,
      lines: await Promise.all(
        lines.map(async (line) => {
          const billedQuantity = await repo.billedQuantity(line.id, tx)
          return dto(DeliveryNoteLineSchema.strip(), {
            ...line,
            billedQuantity,
            remainingBillableQuantity:
              row.invoiceId || !['delivered', 'acknowledged'].includes(row.status)
                ? 0
                : line.quantity - billedQuantity,
          })
        }),
      ),
    })
  }
  async function prepareInput(
    input: DeliveryNoteInput,
    actor: string,
    tx: Transaction,
    exceptNoteId: string | null,
  ) {
    const company = await repo.company(tx)
    const invoice = input.invoiceId ? await repo.invoice(input.invoiceId, tx) : null
    if (invoice && invoice.clientId !== input.clientId)
      throw new AppError(400, 'CLIENT_MISMATCH', 'Delivery note client must match its invoice.')
    const client = await repo.client(input.clientId, tx)
    const sourceIds = [
      ...new Set(
        input.lines.map((line) => line.sourceInvoiceLineId).filter((id): id is string => !!id),
      ),
    ].sort()
    if (invoice ? sourceIds.length !== input.lines.length : sourceIds.length)
      throw new AppError(
        400,
        'INVALID_SOURCE_LINES',
        'Invoice-linked lines must each select a distinct source line; independent lines cannot select one.',
      )
    const sourceLines = new Map<string, Awaited<ReturnType<typeof repo.invoiceLine>>>()
    for (const id of sourceIds) sourceLines.set(id, await repo.invoiceLine(id, tx))
    const lines = []
    for (const [position, line] of input.lines.entries()) {
      const source = line.sourceInvoiceLineId ? sourceLines.get(line.sourceInvoiceLineId) : null
      if (invoice && (!source || source.invoiceId !== invoice.id))
        throw new AppError(400, 'INVALID_INVOICE_LINE', 'Select a line from the related invoice.')
      if (source && line.productVariantId && source.productVariantId !== line.productVariantId)
        throw new AppError(400, 'VARIANT_MISMATCH', 'Delivery package must match the invoice line.')
      const variant =
        !source && line.productVariantId ? await repo.variant(line.productVariantId, tx) : null
      if (source) {
        const reserved = await repo.reserved(source.id, exceptNoteId, tx)
        if (reserved + line.quantity > source.quantity)
          throw new AppError(
            409,
            'OVER_DELIVERY',
            'Delivery quantity exceeds the remaining invoice quantity.',
          )
      }
      lines.push({
        position,
        sourceInvoiceLineId: source?.id ?? null,
        productId: source?.productId ?? variant?.product.id ?? null,
        productVariantId: source?.productVariantId ?? line.productVariantId,
        productName: source?.productName ?? variant?.product.name ?? line.productName.trim(),
        productReference: source?.productReference ?? variant?.product.reference ?? null,
        packageWeightG: source?.packageWeightG ?? variant?.variant.weightG ?? null,
        quantity: line.quantity,
        createdByUserId: actor,
        updatedByUserId: actor,
      })
    }
    return {
      header: {
        clientId: input.clientId,
        invoiceId: invoice?.id ?? null,
        deliveryDate: input.deliveryDate,
        deliveryAddress: input.deliveryAddress.trim(),
        instructions: input.instructions?.trim() || null,
        includeReceptionSignature: input.includeReceptionSignature,
        issuerSnapshot: invoice?.issuerSnapshot ?? {
          legalName: company.legalName,
          tradeName: company.tradeName,
          addressLine1: company.addressLine1,
          city: company.city,
          countryCode: company.countryCode,
          ice: company.ice,
        },
        clientSnapshot: clientSnapshot(client),
      },
      lines,
    }
  }
  return {
    async list(filters: Parameters<Repository['list']>[0]) {
      if (filters.dateFrom && filters.dateTo && filters.dateFrom > filters.dateTo)
        throw new AppError(400, 'INVALID_DATE_RANGE', 'Start date must not follow end date.')
      const page = await repo.list(filters)
      return dto(DeliveryNotePageSchema, {
        ...page,
        limit: filters.limit,
        offset: filters.offset,
        items: await Promise.all(page.items.map((row) => output(row))),
      })
    },
    async get(id: string) {
      return output(await repo.one(id))
    },
    create(input: DeliveryNoteInput, actor: string) {
      return repo.transaction(async (tx) => {
        await repo.authorize(tx, actor, 'delivery_notes.create')
        const prepared = await prepareInput(input, actor, tx, null)
        const row = await repo.insert(
          { ...prepared.header, createdByUserId: actor, updatedByUserId: actor },
          tx,
        )
        await repo.replaceLines(
          row.id,
          prepared.lines.map((line) => ({ ...line, deliveryNoteId: row.id })),
          tx,
        )
        const result = await output(row, tx)
        await repo.audit(tx, actor, 'create', row.id, null, result)
        return result
      })
    },
    update(id: string, input: DeliveryNoteUpdate, actor: string) {
      return repo.transaction(async (tx) => {
        await repo.authorize(tx, actor, 'delivery_notes.update')
        const before = await repo.one(id, tx, true)
        assertVersion(before.version, input.expectedVersion)
        if (before.status !== 'draft')
          throw new AppError(409, 'INVALID_STATUS', 'Only drafts can be edited.')
        const previous = await output(before, tx)
        const prepared = await prepareInput(input, actor, tx, id)
        const row = await repo.update(id, { ...prepared.header, updatedByUserId: actor }, tx, true)
        await repo.replaceLines(
          id,
          prepared.lines.map((line) => ({ ...line, deliveryNoteId: id })),
          tx,
        )
        const result = await output(row, tx)
        await repo.audit(tx, actor, 'update', id, previous, result)
        return result
      })
    },
    delete(id: string, expectedVersion: number, actor: string) {
      return repo.transaction(async (tx) => {
        await repo.authorize(tx, actor, 'delivery_notes.delete')
        const before = await repo.one(id, tx, true)
        assertVersion(before.version, expectedVersion)
        if (before.status !== 'draft')
          throw new AppError(409, 'INVALID_STATUS', 'Only drafts can be deleted.')
        await repo.delete(id, tx)
        await repo.audit(tx, actor, 'delete', id, before, before)
      })
    },
    prepare(id: string, expectedVersion: number, actor: string) {
      return repo.transaction(async (tx) => {
        await repo.authorize(tx, actor, 'delivery_notes.update')
        const before = await repo.one(id, tx, true)
        assertVersion(before.version, expectedVersion)
        if (before.status !== 'draft')
          throw new AppError(409, 'INVALID_STATUS', 'Delivery note is already prepared.')
        if (!(await repo.lines(id, tx)).length)
          throw new AppError(400, 'EMPTY_DELIVERY', 'Add at least one product before preparing.')
        const currentClientSnapshot = clientSnapshot(await repo.client(before.clientId, tx))
        const year = new Intl.DateTimeFormat('en', {
          year: 'numeric',
          timeZone: 'Africa/Casablanca',
        }).format(new Date())
        let row: DeliveryNoteRow | undefined
        for (let attempt = 0; attempt < 5; attempt++) {
          const number = `BL-${year}-${randomInt(0, 10_000_000_000).toString().padStart(10, '0')}`
          try {
            row = await tx.transaction((savepoint) =>
              repo.update(
                id,
                {
                  status: 'prepared',
                  number,
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
          throw new AppError(409, 'NUMBER_COLLISION', 'Could not assign a unique delivery number.')
        await jobs.enqueuePdfInTransaction(
          tx,
          { documentType: 'delivery_note', documentId: id, sourceVersion: row.contentVersion },
          actor,
        )
        await repo.audit(tx, actor, 'prepare', id, before, row)
        return output(row, tx)
      })
    },
    deliver(id: string, expectedVersion: number, actor: string) {
      return repo.transaction(async (tx) => {
        await repo.authorize(tx, actor, 'delivery_notes.update')
        const before = await repo.one(id, tx, true)
        assertVersion(before.version, expectedVersion)
        if (before.status !== 'prepared')
          throw new AppError(409, 'INVALID_STATUS', 'Prepare the note before delivery.')
        const row = await repo.update(
          id,
          { status: 'delivered', deliveredAt: new Date(), updatedByUserId: actor },
          tx,
        )
        await repo.audit(tx, actor, 'deliver', id, before, row)
        return output(row, tx)
      })
    },
    acknowledge(id: string, expectedVersion: number, receivedByName: string, actor: string) {
      return repo.transaction(async (tx) => {
        await repo.authorize(tx, actor, 'delivery_notes.update')
        const before = await repo.one(id, tx, true)
        assertVersion(before.version, expectedVersion)
        if (before.status !== 'delivered')
          throw new AppError(409, 'INVALID_STATUS', 'Deliver the note before acknowledgment.')
        if (!receivedByName.trim())
          throw new AppError(400, 'RECEIVER_REQUIRED', 'Enter the receiver name.')
        const row = await repo.update(
          id,
          {
            status: 'acknowledged',
            acknowledgedAt: new Date(),
            receivedByName: receivedByName.trim(),
            updatedByUserId: actor,
          },
          tx,
        )
        await repo.audit(tx, actor, 'acknowledge', id, before, row)
        return output(row, tx)
      })
    },
    cancel(id: string, expectedVersion: number, reason: string, actor: string) {
      return repo.transaction(async (tx) => {
        await repo.authorize(tx, actor, 'delivery_notes.update')
        const before = await repo.one(id, tx, true)
        assertVersion(before.version, expectedVersion)
        if (!['prepared', 'delivered'].includes(before.status))
          throw new AppError(409, 'INVALID_STATUS', 'This note cannot be cancelled.')
        if (!reason.trim())
          throw new AppError(400, 'CANCELLATION_REASON_REQUIRED', 'Enter a cancellation reason.')
        if (await repo.hasBillingAllocations(id, tx))
          throw new AppError(409, 'DELIVERY_BILLED', 'Resolve linked invoice allocations first.')
        const row = await repo.update(
          id,
          { status: 'cancelled', cancellationReason: reason.trim(), updatedByUserId: actor },
          tx,
        )
        await repo.audit(tx, actor, 'cancel', id, before, row)
        return output(row, tx)
      })
    },
    async preparePdf(id: string, actor: string) {
      const row = await repo.transaction(async (tx) => {
        await repo.authorize(tx, actor, 'delivery_notes.read')
        return repo.one(id, tx)
      })
      if (row.status === 'draft')
        throw new AppError(409, 'DRAFT_NOT_PRINTABLE', 'Prepare the note first.')
      const job = await jobs.enqueuePdf(
        { documentType: 'delivery_note', documentId: id, sourceVersion: row.contentVersion },
        actor,
      )
      return { jobId: job.id, status: job.status }
    },
    async artifacts(id: string, actor: string) {
      await repo.transaction(async (tx) => {
        await repo.authorize(tx, actor, 'delivery_notes.read')
        await repo.one(id, tx)
      })
      return (await artifacts.list('delivery_note', id, actor)).map(
        ({ id, sourceVersion, format, byteSize, generatedAt }) => ({
          id,
          sourceVersion,
          format,
          byteSize,
          generatedAt: generatedAt.toISOString(),
        }),
      )
    },
  }
}

export function createDeliveryNoteOwnerAccess(repo: Repository) {
  return {
    async assertPublishable(tx: Transaction, id: string, version: number) {
      const row = await repo.one(id, tx, true)
      if (row.status === 'draft' || row.contentVersion !== version)
        throw new AppError(
          409,
          'DOCUMENT_CHANGED',
          'Delivery note is not printable at this version.',
        )
    },
    async assertReadable(tx: Transaction, id: string, actor: string) {
      await repo.authorize(tx, actor, 'delivery_notes.read')
      await repo.one(id, tx)
    },
  }
}
