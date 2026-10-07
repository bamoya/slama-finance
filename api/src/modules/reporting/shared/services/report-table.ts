import { Decimal } from 'decimal.js'

import type {
  ReportRow,
  ReportSection,
} from '../../../../contracts/generated/reporting/reporting.schemas.js'
import { frenchReportLabel } from './report-labels.js'

type Column = { key: keyof ReportRow; label: string; kind: 'text' | 'date' | 'number' }
/** Both file formats use the same frozen supporting records, never a fresh query. */
export function reportTable(section: ReportSection, language: 'fr' | 'en') {
  const fr = language === 'fr'
  const columns: Column[] = [
    { key: 'label', label: fr ? 'Référence / nom' : 'Reference / name', kind: 'text' },
    { key: 'clientName', label: 'Client', kind: 'text' },
    { key: 'invoiceNumber', label: fr ? 'Facture' : 'Invoice', kind: 'text' },
    {
      key: 'date',
      label: ['outstanding', 'overdue'].includes(section.key)
        ? fr
          ? 'Échéance'
          : 'Due date'
        : 'Date',
      kind: 'date',
    },
    { key: 'status', label: fr ? 'Statut' : 'Status', kind: 'text' },
    { key: 'method', label: fr ? 'Mode' : 'Method', kind: 'text' },
    { key: 'reference', label: fr ? 'Référence paiement' : 'Payment reference', kind: 'text' },
    { key: 'net', label: fr ? 'HT' : 'Net', kind: 'number' },
    { key: 'vat', label: fr ? 'TVA' : 'VAT', kind: 'number' },
    { key: 'gross', label: fr ? 'TTC' : 'Gross', kind: 'number' },
    {
      key: 'collected',
      label: fr ? 'Encaissé à la capture' : 'Collected at capture',
      kind: 'number',
    },
    { key: 'balance', label: fr ? 'Solde à la capture' : 'Balance at capture', kind: 'number' },
    { key: 'daysOverdue', label: fr ? 'Retard (j)' : 'Overdue days', kind: 'number' },
    { key: 'amount', label: fr ? 'Montant' : 'Amount', kind: 'number' },
    {
      key: 'quantity',
      label:
        section.key === 'sales_by_client'
          ? fr
            ? 'Factures'
            : 'Invoices'
          : fr
            ? 'Quantité'
            : 'Quantity',
      kind: 'number',
    },
    { key: 'weightKg', label: fr ? 'Poids (kg)' : 'Weight (kg)', kind: 'number' },
  ].filter(
    (column) =>
      column.key === 'label' ||
      section.rows.some((row) => row[column.key as keyof ReportRow] != null),
  ) as Column[]
  // Gross and amount are the same sales measure; do not repeat the same column.
  const selected = columns.filter(
    (column) =>
      column.key !== 'amount' ||
      (!columns.some((item) => item.key === 'balance') &&
        (!columns.some((item) => item.key === 'gross') ||
          section.rows.some((row) => row.amount !== row.gross))),
  )
  const key = (row: ReportRow) =>
    `${row.currency ?? ''}:${section.key === 'payment_methods' ? (row.method ?? '') : ''}`
  const groups = [...new Set(section.rows.map(key))]
  return groups.map((group) => {
    const rows = section.rows.filter((row) => key(row) === group)
    const currency = rows[0]!.currency
    const method = section.key === 'payment_methods' ? rows[0]!.method : null
    const heading = [
      currency,
      method ? (fr ? frenchReportLabel(method) : method.replaceAll('_', ' ')) : null,
    ]
      .filter(Boolean)
      .join(' · ')
    return {
      currency,
      heading,
      columns: selected,
      rows,
      totals: selected.map((column) =>
        column.kind === 'number' && column.key !== 'daysOverdue' && section.key !== 'estimates'
          ? rows
              .reduce((sum, row) => sum.plus(String(row[column.key] ?? '0')), new Decimal(0))
              .toString()
          : column.key === 'label'
            ? fr
              ? 'Total des lignes'
              : 'Row total'
            : '',
      ),
    }
  })
}
