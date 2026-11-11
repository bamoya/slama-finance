import type {
  BillingCustomer,
  BillingInvoice,
} from '../../../../contracts/generated/subscriptions/subscriptions.schemas.js'
import type { Transaction } from '../../../../lib/db.js'
import { AppError } from '../../../../lib/errors.js'
import type { PaymentRow } from '../repositories/billing.repository.js'
import type {
  createBillingDocumentsRepository,
  InvoiceRecord,
} from '../repositories/billing-documents.repository.js'
import { billingTimezone } from './billing-calendar.service.js'
import {
  billingCustomer,
  billingIssuer,
  individualCustomer,
  publicCustomer,
  requireIssuer,
} from './billing-identity.service.js'
import { money } from './coverage.js'

/** Quotes stay valid this long; funds received later are not accepted for them (C6 default). */
export const QUOTE_VALIDITY_MS = 15 * 86_400_000

export type Receipt = {
  /** Observed bank or cash reference: the receipt's idempotency key within its payment. */
  reference: string
  /**
   * False when the reference defaulted to the owner's declaration. A defaulted reference that is
   * already recorded is refused instead of treated as a retry: a second, equal instalment would
   * otherwise be dropped silently.
   */
  referenceGiven: boolean
  /** Centimes received; defaults to the remaining balance. */
  amountTtc?: number
  /** When the funds arrived; defaults to now. */
  receivedAt?: Date
  recordedBy: string
}

export function toInvoice(row: InvoiceRecord): BillingInvoice {
  const invoice = row.kind === 'invoice'
  const balanceTtc = invoice ? row.amountTtc - row.allocatedTtc - row.creditedTtc : 0
  return {
    id: row.id,
    number: row.number,
    kind: row.kind,
    correctsInvoiceNumber: row.correctsNumber,
    reason: row.reason,
    paymentId: row.paymentId,
    totals: {
      currency: row.currency,
      amountHt: row.amountHt,
      taxRateBasisPoints: row.taxRateBasisPoints,
      taxAmount: row.taxAmount,
      amountTtc: row.amountTtc,
    },
    lines: row.lines.map((l) => ({
      position: l.position,
      planCode: l.planCode as BillingInvoice['lines'][number]['planCode'],
      planVersionNumber: l.planVersionNumber,
      cycle: l.cycle,
      kind: l.kind,
      amount: {
        currency: l.currency,
        amountHt: l.amountHt,
        taxRateBasisPoints: l.taxRateBasisPoints,
        taxAmount: l.taxAmount,
        amountTtc: l.amountTtc,
      },
    })),
    issuedAt: row.issuedAt.toISOString(),
    allocatedTtc: invoice ? row.allocatedTtc : 0,
    creditedTtc: invoice ? row.creditedTtc : 0,
    balanceTtc,
    status: balanceTtc > 0 ? 'open' : balanceTtc < 0 ? 'refund_due' : 'settled',
    customer: publicCustomer(row.customer),
    issuer: row.issuer,
  }
}

/**
 * Quotes, receipts, invoices, allocations and credit notes. Every call runs inside the caller's
 * transaction under the owner lock; rows are immutable, so retries either find them or add new ones.
 */
export function createBillingDocuments(repo: ReturnType<typeof createBillingDocumentsRepository>) {
  async function issue(
    values: {
      kind: 'invoice' | 'credit_note'
      ownerId: string
      paymentId?: string
      correctsInvoiceId?: string
      reason?: string
      /** Snapshot from the quote (credit note: from the corrected invoice). */
      customer: BillingCustomer
      line: {
        planCode: string
        planVersionId: string
        cycle: 'monthly' | 'annual'
        kind: 'activation' | 'renewal' | 'upgrade'
      }
      amount: ReturnType<typeof money>
      by: string
      now: Date
    },
    tx: Transaction,
  ) {
    // Checked before numbering: an empty issuer legal name fails loudly and the transaction rolls
    // back, so a receipt never exists without its invoice (billing-identity.md).
    const issuer = requireIssuer(billingIssuer(await repo.issuer(tx)))
    const series = values.kind === 'invoice' ? 'F' : 'A'
    const { sequence, year: y, issuedAt } = await repo.nextSequence(series, billingTimezone, tx)
    return repo.insertInvoice(
      {
        ownerId: values.ownerId,
        kind: values.kind,
        series,
        year: y,
        sequence,
        number: `${series}-${y}-${String(sequence).padStart(6, '0')}`,
        paymentId: values.paymentId ?? null,
        correctsInvoiceId: values.correctsInvoiceId ?? null,
        reason: values.reason ?? null,
        ...values.amount,
        issuedAt,
        issuedBy: values.by,
        customer: values.customer,
        issuer,
      },
      [
        {
          position: 1,
          planCode: values.line.planCode,
          planVersionId: values.line.planVersionId,
          cycle: values.line.cycle,
          kind: values.line.kind,
          ...values.amount,
        },
      ],
      tx,
    )
  }

  return {
    /** Immutable offer recorded with a submission (same snapshot, enforced by the database). */
    quote: async (
      values: {
        ownerId: string
        planCode: string
        planVersionId: string
        cycle: 'monthly' | 'annual'
        kind: 'activation' | 'renewal' | 'upgrade'
        amount: ReturnType<typeof money>
        customer: BillingCustomer
      },
      now: Date,
      tx: Transaction,
    ) =>
      repo.insertQuote(
        {
          ownerId: values.ownerId,
          planCode: values.planCode,
          planVersionId: values.planVersionId,
          cycle: values.cycle,
          kind: values.kind,
          ...values.amount,
          // The e-mail is snapshotted too, so an individual's documents never read live account data.
          customer: { ...values.customer, email: await repo.ownerEmail(values.ownerId, tx) },
          issuedAt: now,
          expiresAt: new Date(now.getTime() + QUOTE_VALIDITY_MS),
        },
        tx,
      ),
    /**
     * Records one verified receipt for a submitted payment and allocates it to the payment's invoice,
     * issued at the first receipt. `duplicate`: this reference was already recorded (no write).
     * `settled`: allocations now cover the amount due, so the caller grants coverage.
     */
    async receive(
      payment: PaymentRow,
      input: Receipt,
      now: Date,
      tx: Transaction,
    ): Promise<'duplicate' | 'partial' | 'settled'> {
      const recorded = await repo.receipt(payment.id, input.reference, tx)
      if (recorded) {
        if (!input.referenceGiven)
          throw new AppError(
            409,
            'RECEIPT_REFERENCE_REQUIRED',
            'A receipt is already recorded for this payment. Enter the reference of this receipt.',
          )
        if (input.amountTtc !== undefined && input.amountTtc !== recorded.amountTtc)
          throw new AppError(
            409,
            'RECEIPT_REFERENCE_USED',
            'This reference was already recorded with another amount. Use the reference of the new receipt.',
          )
        return 'duplicate'
      }
      const receivedAt = input.receivedAt ?? now
      if (
        receivedAt.getTime() > now.getTime() ||
        receivedAt.getTime() < payment.submittedAt.getTime()
      )
        throw new AppError(
          400,
          'RECEIVED_AT_INVALID',
          'The receipt date cannot be in the future or before the submission.',
        )
      const quote = payment.quoteId ? await repo.quote(payment.quoteId, tx) : undefined
      if (!quote) throw new AppError(409, 'QUOTE_MISSING', 'This payment has no quote.')
      const issued = await repo.invoiceForPayment(payment.id, tx)
      // Expiry gates the first receipt only: once the quote was accepted with funds in time, later
      // instalments complete it (rejection is refused while funds are held).
      if (!issued && receivedAt.getTime() > quote.expiresAt.getTime())
        throw new AppError(
          409,
          'QUOTE_EXPIRED',
          'The funds arrived after the quote expired. Reject the payment so the owner can submit at current terms.',
        )
      const invoice =
        issued ??
        (await issue(
          {
            kind: 'invoice',
            ownerId: payment.ownerId,
            paymentId: payment.id,
            customer: quote.customer,
            line: quote,
            amount: {
              currency: quote.currency,
              amountHt: quote.amountHt,
              taxRateBasisPoints: quote.taxRateBasisPoints,
              taxAmount: quote.taxAmount,
              amountTtc: quote.amountTtc,
            },
            by: input.recordedBy,
            now,
          },
          tx,
        ))
      const [allocated, credited] = await Promise.all([
        repo.allocated(invoice.id, tx),
        repo.credited(invoice.id, tx),
      ])
      const balance = invoice.amountTtc - allocated - credited
      const amount = input.amountTtc ?? balance
      if (!Number.isSafeInteger(amount) || amount < 1 || amount > balance)
        throw new AppError(
          400,
          'AMOUNT_EXCEEDS_BALANCE',
          'The received amount must be positive and at most the remaining balance.',
        )
      // An upgrade only covers the running period: instalments could outlive it and strand funds.
      if (payment.kind === 'upgrade' && amount !== balance)
        throw new AppError(
          400,
          'UPGRADE_REQUIRES_FULL_AMOUNT',
          'An upgrade is confirmed only when its full amount is received.',
        )
      const receipt = await repo.insertReceipt(
        {
          ownerId: payment.ownerId,
          paymentId: payment.id,
          method: payment.method,
          reference: input.reference,
          currency: invoice.currency,
          amountTtc: amount,
          receivedAt,
          recordedAt: now,
          recordedBy: input.recordedBy,
        },
        tx,
      )
      await repo.insertAllocation(
        { receiptId: receipt.id, invoiceId: invoice.id, amountTtc: amount, allocatedAt: now },
        tx,
      )
      return amount === balance ? 'settled' : 'partial'
    },
    /**
     * Explicit correction at the invoice's tax rate. The caller checks that the payment is decided;
     * the credited total never exceeds the invoice. Coverage is not changed.
     */
    async creditNote(
      invoiceId: string,
      input: { amountHt: number; reason: string; by: string },
      now: Date,
      tx: Transaction,
    ) {
      // Serialized by the caller's owner lock (no row lock: issued tables have no UPDATE grant).
      const invoice = await repo.invoice(invoiceId, tx)
      if (!invoice || invoice.kind !== 'invoice')
        throw new AppError(404, 'NOT_FOUND', 'Invoice not found.')
      const reason = input.reason.trim()
      if (!reason) throw new AppError(400, 'REASON_REQUIRED', 'Give a reason for the correction.')
      // HT and tax are each bounded by what remains of the invoice; the note crediting the last HT
      // takes the remaining tax, so credited HT/tax always reconcile with the invoice split.
      const credited = await repo.creditedSplit(invoice.id, tx)
      const remainingHt = invoice.amountHt - credited.ht,
        remainingTax = invoice.taxAmount - credited.tax
      if (
        !Number.isSafeInteger(input.amountHt) ||
        input.amountHt < 1 ||
        input.amountHt > remainingHt
      )
        throw new AppError(
          400,
          'CREDIT_EXCEEDS_INVOICE',
          'Credit notes cannot exceed the invoice total.',
        )
      const rounded = money(input.amountHt, invoice.taxRateBasisPoints, invoice.currency)
      const taxAmount =
        input.amountHt === remainingHt ? remainingTax : Math.min(rounded.taxAmount, remainingTax)
      const amount = { ...rounded, taxAmount, amountTtc: input.amountHt + taxAmount }
      const [line] = invoice.lines
      const note = await issue(
        {
          kind: 'credit_note',
          ownerId: invoice.ownerId,
          correctsInvoiceId: invoice.id,
          reason,
          customer: invoice.customer,
          line: line!,
          amount,
          by: input.by,
          now,
        },
        tx,
      )
      return note
    },
    /** Credits everything not yet credited on a payment's invoice (rejection with received funds). */
    async creditRemainder(
      paymentId: string,
      reason: string,
      by: string,
      now: Date,
      tx: Transaction,
    ) {
      const invoice = (await repo.invoiceForPayment(paymentId, tx))!
      const credited = await repo.creditedSplit(invoice.id, tx)
      return this.creditNote(
        invoice.id,
        { amountHt: invoice.amountHt - credited.ht, reason, by },
        now,
        tx,
      )
    },
    /** Saved checkout identity (individual when never set). */
    async customer(ownerId: string, tx: Transaction): Promise<BillingCustomer> {
      const row = await repo.customerProfile(ownerId, tx)
      return row
        ? {
            type: row.type,
            legalName: row.legalName,
            ice: row.ice,
            address: row.address,
            registrationNumber: row.registrationNumber,
            taxIdentifier: row.taxIdentifier,
          }
        : individualCustomer
    },
    /** Validates and saves the checkout identity; returns the stored value. */
    async saveCustomer(ownerId: string, input: BillingCustomer, tx: Transaction) {
      const customer = billingCustomer(input)
      await repo.saveCustomerProfile({ ownerId, ...customer }, tx)
      return customer
    },
    invoice: (id: string, tx: Transaction) => repo.invoice(id, tx),
    invoices: (filter: { ownerId?: string; page: number; pageSize: number }, tx: Transaction) =>
      repo.invoices(filter, tx),
  }
}
