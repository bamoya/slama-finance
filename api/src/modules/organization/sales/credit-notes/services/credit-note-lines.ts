import type { CreditNoteLineInput } from '../../../../../contracts/generated/sales/credit-notes.schemas.js'
import { AppError } from '../../../../../lib/errors.js'
import { FinancialDecimal } from '../../../../../lib/validation.js'

type Decimal = InstanceType<typeof FinancialDecimal>
export type CreditableSource = {
  id: string
  position: number
  productName: string
  productReference: string | null
  quantity: number
  unitPrice: string
  vatRate: string | null
  netAmount: string
  taxAmount: string
}
export type CreditedSoFar = { quantity: string; net: string; tax: string }
export const money = (value: Decimal) => value.toDecimalPlaces(2).toFixed(2)

/** What is left to credit on an invoice line after the ISSUED credit notes. */
export function remaining(line: CreditableSource, credited?: CreditedSoFar) {
  return {
    quantity: line.quantity - Number(credited?.quantity ?? 0),
    net: new FinancialDecimal(line.netAmount).minus(credited?.net ?? 0),
    tax: new FinancialDecimal(line.taxAmount).minus(credited?.tax ?? 0),
  }
}

const exceeds = (name: string) =>
  new AppError(
    409,
    'CREDIT_EXCEEDS_INVOICE',
    `The credit exceeds what remains creditable on "${name}".`,
  )

/**
 * Exact integer-centime arithmetic, consistent with invoices: net = quantity x unit price (or the given HT
 * amount), VAT = net x rate / 100 rounded half-up to the centime, TTC = net + VAT. The credit that exhausts the
 * line's remaining HT takes the line's remaining VAT (remainder logic), so crediting a whole line always equals
 * the line exactly; VAT is otherwise capped to the remaining VAT of the line.
 */
export function creditLine(
  source: CreditableSource,
  credited: CreditedSoFar | undefined,
  input: CreditNoteLineInput,
) {
  const hasQuantity = input.quantity !== undefined && input.quantity !== null
  const hasAmount = input.amount !== undefined && input.amount !== null
  if (hasQuantity === hasAmount)
    throw new AppError(
      400,
      'INVALID_CREDIT_LINE',
      `Credit either a quantity or an amount on "${source.productName}", not both.`,
    )
  const left = remaining(source, credited)
  let net: Decimal
  let quantity = 0
  if (hasQuantity) {
    quantity = input.quantity!
    if (quantity > left.quantity) throw exceeds(source.productName)
    net = new FinancialDecimal(source.unitPrice).times(quantity).toDecimalPlaces(2)
    // Crediting the whole remaining quantity after an amount credit: the HT is what the line still holds.
    if (quantity === left.quantity && net.gt(left.net)) net = left.net
  } else {
    net = new FinancialDecimal(input.amount!).toDecimalPlaces(2)
  }
  // A returned free item (unit price 0.00) is recorded by its quantity at a zero HT; an amount credit must be positive.
  if (net.lt(0) || (net.eq(0) && quantity === 0))
    throw new AppError(
      400,
      'INVALID_CREDIT_LINE',
      `The credited amount of "${source.productName}" must be positive.`,
    )
  if (net.gt(left.net)) throw exceeds(source.productName)
  const rate = source.vatRate === null ? null : new FinancialDecimal(source.vatRate)
  let tax = rate ? net.times(rate).dividedBy(100).toDecimalPlaces(2) : new FinancialDecimal(0)
  if (net.eq(left.net)) tax = left.tax
  else if (tax.gt(left.tax)) tax = left.tax
  return {
    invoiceLineId: source.id,
    productName: source.productName,
    productReference: source.productReference,
    quantity,
    unitPrice: source.unitPrice,
    vatRate: source.vatRate,
    netAmount: money(net),
    taxAmount: money(tax),
    totalAmount: money(net.plus(tax)),
  }
}

export function creditableLine(source: CreditableSource, credited?: CreditedSoFar) {
  const left = remaining(source, credited)
  const creditedNet = new FinancialDecimal(credited?.net ?? 0)
  const creditedTax = new FinancialDecimal(credited?.tax ?? 0)
  return {
    invoiceLineId: source.id,
    position: source.position,
    productName: source.productName,
    productReference: source.productReference,
    vatRate: source.vatRate,
    unitPrice: source.unitPrice,
    quantity: source.quantity,
    netAmount: source.netAmount,
    taxAmount: source.taxAmount,
    totalAmount: money(new FinancialDecimal(source.netAmount).plus(source.taxAmount)),
    creditedQuantity: Number(credited?.quantity ?? 0),
    creditedNetAmount: money(creditedNet),
    creditedTaxAmount: money(creditedTax),
    creditedTotalAmount: money(creditedNet.plus(creditedTax)),
    remainingQuantity: left.quantity,
    remainingNetAmount: money(left.net),
    remainingTaxAmount: money(left.tax),
    remainingTotalAmount: money(left.net.plus(left.tax)),
  }
}
