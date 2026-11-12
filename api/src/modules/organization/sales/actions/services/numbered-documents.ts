/**
 * Numbered documents (issued estimates, invoices, delivery notes and every payment) are never deleted:
 * deleting one would leave a gap in a gap-free series. Cancellation is the correction path. The same rule
 * is enforced by database triggers; this check turns it into a clear blocker before any write.
 */
export const NUMBERED_DOCUMENTS_BLOCKER = 'NUMBERED_DOCUMENTS'

export function hasNumberedDocuments(removed: Record<string, { number: string | null }[]>) {
  return Object.values(removed).some((rows) => rows.some((row) => row.number !== null))
}
