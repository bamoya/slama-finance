import { StatusBadge } from '../../../../../components/management/status-badge'

/** Marks a simple invoice (unregistered individual, FS series); legal invoices carry no badge. */
export function InvoiceKindBadge({ kind }: { kind: 'simple' | 'legal' | null | undefined }) {
  return kind === 'simple' ? <StatusBadge label="Simple invoice" tone="draft" /> : null
}
