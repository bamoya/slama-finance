import { randomInt } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'

import {
  type PaymentInput,
  PaymentPageSchema,
  PaymentReceiptSnapshotSchema,
  PaymentSchema,
} from '../../../../contracts/generated/sales/payments.schemas.js'
import type { Transaction } from '../../../../lib/db.js'
import { AppError } from '../../../../lib/errors.js'
import { assertVersion, companyDate, FinancialDecimal } from '../../../../lib/validation.js'
import {
  type createPaymentRepository,
  paymentBalanceForInvoice,
  type PaymentListFilters,
  type PaymentRow,
} from '../repositories/payment.repository.js'

type Repository = ReturnType<typeof createPaymentRepository>
const dto = <T>(schema: { parse(value: unknown): T }, value: unknown): T =>
  schema.parse(JSON.parse(JSON.stringify(value)))

function validateCollectionDate(date: string | null, timezone: string) {
  if (date && date > companyDate(new Date(), timezone))
    throw new AppError(400, 'FUTURE_COLLECTION_DATE', 'Collection date cannot be in the future.')
}

function validateMethod(input: PaymentInput, timezone: string) {
  const hasReference = Boolean(input.reference?.trim())
  const hasChequeBank = Boolean(input.chequeBank?.trim())
  const hasChequeNumber = Boolean(input.chequeNumber?.trim())
  if (input.method === 'cash') {
    if (
      input.status !== 'confirmed' ||
      !input.collectedOn ||
      input.bankAccountId ||
      input.reference ||
      input.chequeBank ||
      input.chequeNumber
    )
      throw new AppError(
        400,
        'INVALID_PAYMENT_METHOD',
        'Cash must be collected immediately without bank or cheque details.',
      )
  } else if (input.method === 'bank_transfer') {
    if (!hasReference || input.chequeBank || input.chequeNumber)
      throw new AppError(
        400,
        'INVALID_PAYMENT_METHOD',
        'A bank transfer needs a reference and no cheque details.',
      )
  } else if (input.method === 'cheque') {
    if (input.status !== 'pending' || !hasChequeBank || !hasChequeNumber || input.reference)
      throw new AppError(
        400,
        'INVALID_PAYMENT_METHOD',
        'A cheque must start pending with a bank and cheque number.',
      )
  }
  if (input.status === 'pending' && input.collectedOn)
    throw new AppError(
      400,
      'INVALID_COLLECTION_DATE',
      'Pending payments cannot have a collection date.',
    )
  if (input.status === 'confirmed' && !input.collectedOn)
    throw new AppError(
      400,
      'COLLECTION_DATE_REQUIRED',
      'Confirmed payments need a collection date.',
    )
  validateCollectionDate(input.collectedOn, timezone)
}

export function createPaymentService(
  repo: Repository,
  callbacks?: {
    invalidate: (tx: Transaction) => Promise<void>
    paymentConfirmed: (tx: Transaction, id: string) => Promise<void>
  },
) {
  const output = async (row: PaymentRow, tx?: Parameters<typeof repo.related>[1]) => {
    const related = await repo.related(row.id, tx)
    return dto(PaymentSchema.strip(), {
      ...row,
      receiptNumber: row.number.replace(/^PAY-/, 'REC-'),
      invoiceNumber: related.invoiceNumber,
      clientId: related.clientId,
      clientName: related.clientName,
    })
  }
  return {
    async list(filters: PaymentListFilters) {
      if (filters.dateFrom && filters.dateTo && filters.dateFrom > filters.dateTo)
        throw new AppError(400, 'INVALID_DATE_RANGE', 'Date range is reversed.')
      const page = await repo.list(filters)
      return dto(PaymentPageSchema, {
        items: page.items.map((item) =>
          dto(PaymentSchema.strip(), {
            ...item.payment,
            receiptNumber: item.payment.number.replace(/^PAY-/, 'REC-'),
            invoiceNumber: item.invoiceNumber,
            clientId: item.clientId,
            clientName: item.clientName,
          }),
        ),
        total: page.total,
        limit: filters.limit,
        offset: filters.offset,
      })
    },
    async get(id: string) {
      return output(await repo.one(id))
    },
    create(input: PaymentInput, actor: string) {
      return repo.transaction(async (tx) => {
        await repo.authorize(tx, actor, 'payments.create')
        if (input.status === 'confirmed' && input.method !== 'cash')
          await repo.authorize(tx, actor, 'payments.update')
        await repo.lockOperation(input.operationId, tx)
        const existing = await repo.byOperation(input.operationId, tx)
        if (existing) {
          if (!isDeepStrictEqual(existing.creationRequest, input))
            throw new AppError(
              409,
              'OPERATION_CONFLICT',
              'This operation ID was used for another payment request.',
            )
          return output(existing, tx)
        }
        if (await repo.wasDeletedOperation(input.operationId, tx))
          throw new AppError(
            409,
            'PAYMENT_DELETED',
            'This operation ID belongs to a deleted payment. Use a new operation ID.',
          )
        validateMethod(input, await repo.timezone(tx))
        const invoice = await repo.invoice(input.invoiceId, tx)
        if (!['issued', 'sent'].includes(invoice.status))
          throw new AppError(409, 'INVOICE_NOT_PAYABLE', 'Select an issued or sent invoice.')
        if (input.currency !== invoice.currency)
          throw new AppError(400, 'CURRENCY_MISMATCH', 'Payment currency must match the invoice.')
        if (input.bankAccountId) {
          const bank = await repo.bank(input.bankAccountId, tx)
          if (bank.currency !== input.currency)
            throw new AppError(
              400,
              'CURRENCY_MISMATCH',
              'Bank account currency must match the payment.',
            )
        }
        const balance = await paymentBalanceForInvoice(tx, invoice.id)
        if (!balance || new FinancialDecimal(input.amount).gt(balance.availableBalance))
          throw new AppError(409, 'OVERPAYMENT', 'Payment exceeds the available invoice balance.')
        const year = new Intl.DateTimeFormat('en', {
          year: 'numeric',
          timeZone: 'Africa/Casablanca',
        }).format(new Date())
        const paidAtRecording = new FinancialDecimal(balance.paidAmount)
          .plus(input.status === 'confirmed' ? input.amount : 0)
          .toFixed(2)
        const receiptSnapshot = PaymentReceiptSnapshotSchema.parse({
          invoiceNumber: invoice.number,
          invoiceTotal: invoice.total,
          issuer: {
            ...(invoice.issuerSnapshot as Record<string, unknown>),
            locale: invoice.locale,
          },
          client: invoice.clientSnapshot,
          appearance: invoice.appearanceSnapshot,
          templateId: invoice.templateId,
          capturedAt: new Date().toISOString(),
          paidAtRecording,
          remainingAtRecording: new FinancialDecimal(invoice.total)
            .minus(paidAtRecording)
            .toFixed(2),
        })
        let row: PaymentRow | undefined
        for (let attempt = 0; attempt < 5; attempt++) {
          const number = `PAY-${year}-${randomInt(0, 10_000_000_000).toString().padStart(10, '0')}`
          try {
            row = await tx.transaction((savepoint) =>
              repo.insert(
                {
                  number,
                  operationId: input.operationId,
                  creationRequest: input,
                  receiptSnapshot,
                  invoiceId: invoice.id,
                  amount: new FinancialDecimal(input.amount).toFixed(2),
                  currency: input.currency,
                  method: input.method,
                  status: input.status,
                  paymentDate: input.paymentDate,
                  collectedOn: input.collectedOn,
                  bankAccountId: input.bankAccountId,
                  reference: input.reference?.trim() || null,
                  chequeBank: input.chequeBank?.trim() || null,
                  chequeNumber: input.chequeNumber?.trim() || null,
                  confirmedAt: input.status === 'confirmed' ? new Date() : null,
                  createdByUserId: actor,
                  updatedByUserId: actor,
                },
                savepoint,
              ),
            )
            break
          } catch (error) {
            const databaseError = error as {
              code?: string
              constraint_name?: string
              constraint?: string
            }
            if (databaseError.code !== '23505') throw error
            const constraint = databaseError.constraint_name ?? databaseError.constraint
            if (constraint === 'payments_cheque_identity_idx')
              throw new AppError(409, 'DUPLICATE_CHEQUE', 'This cheque is already recorded.')
            if (constraint !== 'payments_number_unique') throw error
          }
        }
        if (!row)
          throw new AppError(409, 'NUMBER_COLLISION', 'Could not assign a unique payment number.')
        const result = await output(row, tx)
        await repo.audit(tx, actor, 'create', row.id, null, result)
        if (row.status === 'confirmed') await callbacks?.paymentConfirmed(tx, row.id)
        await callbacks?.invalidate(tx)
        return result
      })
    },
    confirm(id: string, expectedVersion: number, collectedOn: string, actor: string) {
      return repo.transaction(async (tx) => {
        await repo.authorize(tx, actor, 'payments.update')
        const initial = await repo.one(id, tx)
        const invoice = await repo.invoice(initial.invoiceId, tx)
        const before = await repo.one(id, tx, true)
        assertVersion(before.version, expectedVersion)
        if (before.status !== 'pending' || before.method === 'cash')
          throw new AppError(
            409,
            'INVALID_STATUS',
            'Only pending transfers and cheques can be confirmed.',
          )
        if (!['issued', 'sent'].includes(invoice.status))
          throw new AppError(409, 'INVOICE_NOT_PAYABLE', 'Invoice is not payable.')
        validateCollectionDate(collectedOn, await repo.timezone(tx))
        const row = await repo.update(
          id,
          { status: 'confirmed', collectedOn, confirmedAt: new Date(), updatedByUserId: actor },
          tx,
        )
        const result = await output(row, tx)
        await repo.audit(tx, actor, 'confirm', id, before, result)
        await callbacks?.paymentConfirmed(tx, id)
        await callbacks?.invalidate(tx)
        return result
      })
    },
    cancel(id: string, expectedVersion: number, reason: string, actor: string) {
      return repo.transaction(async (tx) => {
        await repo.authorize(tx, actor, 'payments.update')
        const initial = await repo.one(id, tx)
        await repo.invoice(initial.invoiceId, tx)
        const before = await repo.one(id, tx, true)
        assertVersion(before.version, expectedVersion)
        if (before.status === 'cancelled')
          throw new AppError(409, 'INVALID_STATUS', 'Payment is already cancelled.')
        if (!reason.trim())
          throw new AppError(400, 'CANCELLATION_REASON_REQUIRED', 'Enter a cancellation reason.')
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
        const result = await output(row, tx)
        await repo.audit(tx, actor, 'cancel', id, before, result, reason.trim())
        await callbacks?.invalidate(tx)
        return result
      })
    },
    restore(id: string, expectedVersion: number, actor: string) {
      return repo.transaction(async (tx) => {
        await repo.authorize(tx, actor, 'payments.update')
        const initial = await repo.one(id, tx)
        const invoice = await repo.invoice(initial.invoiceId, tx)
        const before = await repo.one(id, tx, true)
        assertVersion(before.version, expectedVersion)
        if (before.status !== 'cancelled')
          throw new AppError(409, 'INVALID_STATUS', 'Only cancelled payments can be restored.')
        if (!['issued', 'sent'].includes(invoice.status))
          throw new AppError(409, 'INVOICE_NOT_PAYABLE', 'Invoice is not payable.')
        if (before.currency !== invoice.currency)
          throw new AppError(
            409,
            'CURRENCY_MISMATCH',
            'Payment currency no longer matches the invoice.',
          )
        const wasConfirmed = before.confirmedAt !== null && before.collectedOn !== null
        const wasPending = before.confirmedAt === null && before.collectedOn === null
        if (!wasConfirmed && !wasPending)
          throw new AppError(409, 'INVALID_RESTORE_STATE', 'The prior payment status is unclear.')
        if (wasConfirmed) validateCollectionDate(before.collectedOn, await repo.timezone(tx))
        const balance = await paymentBalanceForInvoice(tx, invoice.id)
        if (!balance || new FinancialDecimal(before.amount).gt(balance.availableBalance))
          throw new AppError(
            409,
            'OVERPAYMENT',
            'Restoring this payment exceeds the available invoice balance.',
          )
        let row: PaymentRow
        try {
          row = await repo.update(
            id,
            {
              status: wasConfirmed ? 'confirmed' : 'pending',
              cancelledAt: null,
              cancellationReason: null,
              updatedByUserId: actor,
            },
            tx,
          )
        } catch (error) {
          const databaseError = error as {
            code?: string
            constraint_name?: string
            constraint?: string
          }
          if (
            databaseError.code === '23505' &&
            (databaseError.constraint_name ?? databaseError.constraint) ===
              'payments_cheque_identity_idx'
          )
            throw new AppError(409, 'DUPLICATE_CHEQUE', 'This cheque is already recorded.')
          throw error
        }
        const result = await output(row, tx)
        await repo.audit(tx, actor, 'restore', id, before, result)
        await callbacks?.invalidate(tx)
        return result
      })
    },
    delete(id: string, expectedVersion: number, actor: string) {
      return repo.transaction(async (tx) => {
        await repo.authorize(tx, actor, 'payments.delete')
        const initial = await repo.one(id, tx)
        await repo.lockOperation(initial.operationId, tx)
        await repo.invoice(initial.invoiceId, tx)
        const before = await repo.one(id, tx, true)
        assertVersion(before.version, expectedVersion)
        if (before.receiptIssuedAt)
          throw new AppError(
            409,
            'RECEIPT_ISSUED',
            'A receipt has been issued. Cancel this payment instead of deleting it.',
          )
        await repo.delete(id, tx)
        await repo.audit(tx, actor, 'delete', id, before, null)
      })
    },
  }
}
