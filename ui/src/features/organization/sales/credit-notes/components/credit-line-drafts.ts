import type { InvoiceCreditableLine } from '../../../../../api/generated/models'
import { fromCents, isPositiveAmount, quantityNetCents, taxCents, toCents } from './credit-amounts'

export type CreditLineDraft = { selected: boolean; mode: 'quantity' | 'amount'; value: string }
export type CreditLineDrafts = Record<string, CreditLineDraft>

export const emptyDraft: CreditLineDraft = { selected: false, mode: 'quantity', value: '' }

/** Returns null when the draft is valid for the line, otherwise the message key and its limit. */
export function draftIssue(line: InvoiceCreditableLine, draft: CreditLineDraft) {
  if (draft.mode === 'quantity') {
    const quantity = Number(draft.value)
    const valid =
      /^[1-9][0-9]*$/.test(draft.value) && quantity >= 1 && quantity <= line.remainingQuantity
    if (!valid) return { key: 'quantityInvalid', max: String(line.remainingQuantity) }
    if (
      quantity !== line.remainingQuantity &&
      quantityNetCents(quantity, line.unitPrice) > toCents(line.remainingNetAmount)
    )
      return { key: 'amountInvalid', max: line.remainingNetAmount }
    return null
  }
  const valid =
    isPositiveAmount(draft.value) && toCents(draft.value) <= toCents(line.remainingNetAmount)
  return valid ? null : { key: 'amountInvalid', max: line.remainingNetAmount }
}

/** Credited HT / VAT / TTC of one draft line, with the server's integer-centime rounding. */
export function draftAmounts(line: InvoiceCreditableLine, draft: CreditLineDraft) {
  if (draftIssue(line, draft)) return { net: 0, tax: 0 }
  let net =
    draft.mode === 'quantity'
      ? quantityNetCents(Number(draft.value), line.unitPrice)
      : toCents(draft.value)
  const remainingNet = toCents(line.remainingNetAmount)
  const remainingTax = toCents(line.remainingTaxAmount)
  if (draft.mode === 'quantity' && Number(draft.value) === line.remainingQuantity)
    net = Math.min(net, remainingNet)
  const tax =
    net === remainingNet ? remainingTax : Math.min(taxCents(net, line.vatRate), remainingTax)
  return { net, tax }
}

export function creditPreview(lines: InvoiceCreditableLine[], drafts: CreditLineDrafts) {
  let net = 0
  let tax = 0
  for (const line of lines) {
    const draft = drafts[line.invoiceLineId]
    if (!draft?.selected) continue
    const amounts = draftAmounts(line, draft)
    net += amounts.net
    tax += amounts.tax
  }
  return { net: fromCents(net), tax: fromCents(tax), total: fromCents(net + tax) }
}
