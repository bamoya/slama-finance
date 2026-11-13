import {
  type CreditNoteInput,
  type CreditNoteLineInput,
  CreditNoteLineSchema,
  CreditNotePageSchema,
  CreditNoteSchema,
  type CreditNoteUpdate,
  InvoiceCreditableLinesSchema,
} from '../../../../../contracts/generated/sales/credit-notes.schemas.js'
import type { Transaction } from '../../../../../lib/db.js'
import { AppError } from '../../../../../lib/errors.js'
import { publicData } from '../../../../../lib/public-data.js'
import { assertVersion, companyDate, FinancialDecimal } from '../../../../../lib/validation.js'
import type { createArtifactSupport } from '../../../../../support/artifacts/index.js'
import type { createJobSupport } from '../../../../../support/jobs/index.js'
import { snapshotClientName } from '../../shared/repositories/document-client.js'
import type {
  createCreditNoteRepository,
  CreditNoteRow,
} from '../repositories/credit-note.repository.js'
import { creditableLine, creditLine, money, remaining } from './credit-note-lines.js'

type Repository = ReturnType<typeof createCreditNoteRepository>
type Jobs = ReturnType<typeof createJobSupport>
type Artifacts = ReturnType<typeof createArtifactSupport>['service']
const dto = <T>(schema: { parse(value: unknown): T }, value: unknown): T =>
  schema.parse(publicData(value))
const zero = () => new FinancialDecimal(0)

export function createCreditNoteService(
  repo: Repository,
  jobs: Jobs,
  artifacts: Artifacts,
  onBalanceChange?: (tx: Transaction) => Promise<void>,
) {
  async function output(row: CreditNoteRow, tx?: Transaction) {
    const lines = await repo.lines(row.id, tx)
    return dto(CreditNoteSchema.strip(), {
      ...row,
      clientDisplayName: snapshotClientName(row.clientSnapshot),
      lines: lines.map((line) => dto(CreditNoteLineSchema.strip(), line)),
    })
  }
  /** Only an issued or sent invoice (so numbered, not cancelled) can be corrected. */
  function assertCreditable(invoice: {
    status: string
    number: string | null
    kind: string | null
  }) {
    if (!['issued', 'sent'].includes(invoice.status) || !invoice.number || !invoice.kind)
      throw new AppError(
        409,
        'INVOICE_NOT_CREDITABLE',
        'Only issued or sent invoices can be credited.',
      )
  }
  async function buildLines(invoiceId: string, inputs: CreditNoteLineInput[], tx: Transaction) {
    const [sources, credited, invoice] = await Promise.all([
      repo.invoiceLines(invoiceId, tx),
      repo.creditedByLine(invoiceId, tx),
      repo.invoice(invoiceId, tx),
    ])
    const byId = new Map(sources.map((line) => [line.id, line]))
    if (new Set(inputs.map((line) => line.invoiceLineId)).size !== inputs.length)
      throw new AppError(400, 'DUPLICATE_CREDIT_LINE', 'Credit each invoice line only once.')
    let net = zero()
    let tax = zero()
    const lines = inputs.map((input, position) => {
      const source = byId.get(input.invoiceLineId)
      if (!source)
        throw new AppError(
          400,
          'INVALID_CREDIT_LINE',
          'A credited line does not belong to the invoice.',
        )
      const line = creditLine(source, credited.get(source.id), input)
      net = net.plus(line.netAmount)
      tax = tax.plus(line.taxAmount)
      return { position, ...line }
    })
    // Invoice level cap (HT, VAT and TTC), on top of the per line caps.
    const creditedNet = [...credited.values()].reduce((sum, c) => sum.plus(c.net), zero())
    const creditedTax = [...credited.values()].reduce((sum, c) => sum.plus(c.tax), zero())
    if (
      net.plus(creditedNet).gt(invoice.subtotal) ||
      tax.plus(creditedTax).gt(invoice.taxTotal) ||
      net.plus(tax).plus(creditedNet).plus(creditedTax).gt(invoice.total)
    )
      throw new AppError(
        409,
        'CREDIT_EXCEEDS_INVOICE',
        'Issued credit notes cannot exceed the invoice total.',
      )
    return {
      lines,
      subtotal: money(net),
      taxTotal: money(tax),
      total: money(net.plus(tax)),
    }
  }
  return {
    async list(filters: Parameters<Repository['list']>[0]) {
      const page = await repo.list(filters)
      return dto(CreditNotePageSchema, {
        ...page,
        limit: filters.limit,
        offset: filters.offset,
        items: await Promise.all(page.items.map((row) => output(row))),
      })
    },
    async get(id: string) {
      return output(await repo.one(id))
    },
    async forInvoice(invoiceId: string, actor: string) {
      return repo.transaction(async (tx) => {
        await repo.authorize(tx, actor, 'credit_notes.read')
        await repo.authorize(tx, actor, 'invoices.read')
        await repo.invoice(invoiceId, tx)
        return Promise.all((await repo.forInvoice(invoiceId, tx)).map((row) => output(row, tx)))
      })
    },
    async creditableLines(invoiceId: string, actor: string) {
      return repo.transaction(async (tx) => {
        await repo.authorize(tx, actor, 'credit_notes.create')
        await repo.authorize(tx, actor, 'invoices.read')
        const invoice = await repo.invoice(invoiceId, tx)
        const [sources, credited] = await Promise.all([
          repo.invoiceLines(invoiceId, tx),
          repo.creditedByLine(invoiceId, tx),
        ])
        const lines = sources.map((line) => creditableLine(line, credited.get(line.id)))
        const creditedAmount = [...credited.values()].reduce(
          (sum, c) => sum.plus(c.net).plus(c.tax),
          zero(),
        )
        const left = new FinancialDecimal(invoice.total).minus(creditedAmount)
        const active = ['issued', 'sent'].includes(invoice.status)
        return dto(InvoiceCreditableLinesSchema, {
          invoiceId,
          invoiceNumber: invoice.number ?? '',
          currency: invoice.currency,
          creditable: active && (left.gt(0) || lines.some((line) => line.remainingQuantity > 0)),
          creditedAmount: money(creditedAmount),
          remainingAmount: money(active ? left : zero()),
          lines,
        })
      })
    },
    create(input: CreditNoteInput, actor: string) {
      return repo.transaction(async (tx) => {
        await repo.authorize(tx, actor, 'credit_notes.create')
        await repo.authorize(tx, actor, 'invoices.read')
        await repo.lockInvoice(tx, input.invoiceId)
        const invoice = await repo.invoice(input.invoiceId, tx, true)
        assertCreditable(invoice)
        const built = await buildLines(invoice.id, input.lines, tx)
        const row = await repo.insert(
          {
            kind: invoice.kind!,
            invoiceId: invoice.id,
            invoiceNumber: invoice.number!,
            invoiceIssueDate: invoice.issueDate,
            clientId: invoice.clientId,
            templateId: invoice.templateId,
            currency: invoice.currency,
            locale: invoice.locale,
            reason: input.reason.trim(),
            issuerSnapshot: invoice.issuerSnapshot,
            clientSnapshot: invoice.clientSnapshot,
            appearanceSnapshot: invoice.appearanceSnapshot,
            bankDetailsSnapshot: invoice.bankDetailsSnapshot,
            subtotal: built.subtotal,
            taxTotal: built.taxTotal,
            total: built.total,
            createdByActorId: actor,
            updatedByActorId: actor,
          },
          tx,
        )
        await repo.replaceLines(
          row.id,
          built.lines.map((line) => ({
            ...line,
            creditNoteId: row.id,
            createdByActorId: actor,
            updatedByActorId: actor,
          })),
          tx,
        )
        const result = await output(row, tx)
        await repo.audit(tx, actor, 'create', row.id, null, result)
        return result
      })
    },
    update(id: string, input: CreditNoteUpdate, actor: string) {
      return repo.transaction(async (tx) => {
        await repo.authorize(tx, actor, 'credit_notes.update')
        const before = await repo.one(id, tx, true)
        assertVersion(before.version, input.expectedVersion)
        if (before.status !== 'draft')
          throw new AppError(409, 'INVALID_STATUS', 'Only drafts can be edited.')
        await repo.lockInvoice(tx, before.invoiceId)
        assertCreditable(await repo.invoice(before.invoiceId, tx, true))
        const previous = await output(before, tx)
        const built = await buildLines(before.invoiceId, input.lines, tx)
        const row = await repo.update(
          id,
          {
            reason: input.reason.trim(),
            subtotal: built.subtotal,
            taxTotal: built.taxTotal,
            total: built.total,
            updatedByActorId: actor,
          },
          tx,
        )
        await repo.replaceLines(
          id,
          built.lines.map((line) => ({
            ...line,
            creditNoteId: id,
            createdByActorId: actor,
            updatedByActorId: actor,
          })),
          tx,
        )
        const result = await output(row, tx)
        await repo.audit(tx, actor, 'update', id, previous, result)
        return result
      })
    },
    delete(id: string, expectedVersion: number, actor: string) {
      return repo.transaction(async (tx) => {
        await repo.authorize(tx, actor, 'credit_notes.delete')
        const row = await repo.one(id, tx, true)
        assertVersion(row.version, expectedVersion)
        if (row.status !== 'draft')
          throw new AppError(
            409,
            'INVALID_STATUS',
            'An issued credit note cannot be deleted; correct it with another invoice.',
          )
        const before = await output(row, tx)
        await repo.delete(id, tx)
        await repo.audit(tx, actor, 'delete', id, before, null)
      })
    },
    issue(id: string, expectedVersion: number, actor: string) {
      return repo.transaction(async (tx) => {
        await repo.authorize(tx, actor, 'credit_notes.update')
        const before = await repo.one(id, tx, true)
        assertVersion(before.version, expectedVersion)
        if (before.status !== 'draft')
          throw new AppError(409, 'INVALID_STATUS', 'Credit note is already issued.')
        await repo.lockInvoice(tx, before.invoiceId)
        const invoice = await repo.invoice(before.invoiceId, tx, true)
        assertCreditable(invoice)
        const [sources, credited, lines] = await Promise.all([
          repo.invoiceLines(before.invoiceId, tx),
          repo.creditedByLine(before.invoiceId, tx),
          repo.lines(id, tx),
        ])
        if (!lines.length)
          throw new AppError(400, 'EMPTY_CREDIT_NOTE', 'Credit at least one invoice line.')
        // Re-check the remaining creditable amounts under the invoice lock (other notes may have been issued).
        const byId = new Map(sources.map((line) => [line.id, line]))
        for (const line of lines) {
          const source = byId.get(line.invoiceLineId)!
          const left = remaining(source, credited.get(source.id))
          if (
            line.quantity > left.quantity ||
            new FinancialDecimal(line.netAmount).gt(left.net) ||
            new FinancialDecimal(line.taxAmount).gt(left.tax)
          )
            throw new AppError(
              409,
              'CREDIT_EXCEEDS_INVOICE',
              `The credit exceeds what remains creditable on "${source.productName}".`,
            )
        }
        const company = await repo.company(tx)
        // Number and issue instant are taken last, under the series counter lock.
        const { number, issuedAt } = await repo.nextNumber(
          tx,
          before.kind === 'simple' ? 'AVS' : 'AVO',
          company.timezone,
        )
        const row = await repo.update(
          id,
          {
            status: 'issued',
            number,
            issuedAt,
            issueDate: companyDate(issuedAt, company.timezone),
            updatedByActorId: actor,
          },
          tx,
          true,
        )
        await jobs.enqueuePdfInTransaction(
          tx,
          { documentType: 'credit_note', documentId: id, sourceVersion: row.contentVersion },
          actor,
        )
        const result = await output(row, tx)
        await repo.audit(tx, actor, 'issue', id, before, result)
        await onBalanceChange?.(tx)
        return result
      })
    },
    async preparePdf(id: string, actor: string) {
      const row = await repo.transaction(async (tx) => {
        await repo.authorize(tx, actor, 'credit_notes.update')
        return repo.one(id, tx)
      })
      if (row.status === 'draft')
        throw new AppError(409, 'DRAFT_NOT_PRINTABLE', 'Issue the credit note first.')
      const job = await jobs.enqueuePdf(
        { documentType: 'credit_note', documentId: id, sourceVersion: row.contentVersion },
        actor,
      )
      return { jobId: job.id, status: job.status }
    },
    async artifacts(id: string, actor: string) {
      await repo.transaction(async (tx) => {
        await repo.authorize(tx, actor, 'credit_notes.read')
        await repo.one(id, tx)
      })
      return (await artifacts.list('credit_note', id, actor)).map(
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

export function createCreditNoteOwnerAccess(repo: Repository) {
  return {
    async assertPublishable(tx: Transaction, id: string, version: number) {
      const row = await repo.one(id, tx, true)
      if (row.status === 'draft' || row.contentVersion !== version)
        throw new AppError(409, 'DOCUMENT_CHANGED', 'Credit note is not printable at this version.')
    },
    async assertReadable(tx: Transaction, id: string, actor: string) {
      await repo.authorize(tx, actor, 'credit_notes.read')
      await repo.one(id, tx)
    },
  }
}
