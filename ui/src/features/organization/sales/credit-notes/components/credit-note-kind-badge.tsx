import { StatusBadge } from '../../../../../components/management/status-badge'

/** Marks a simple credit note (AVS series); legal credit notes carry no badge. */
export function CreditNoteKindBadge({ kind }: { kind: 'simple' | 'legal' | null | undefined }) {
  return kind === 'simple' ? <StatusBadge label="Simple credit note" tone="draft" /> : null
}
