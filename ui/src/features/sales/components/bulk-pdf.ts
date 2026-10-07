import { zipSync } from 'fflate'

import {
  downloadArtifact,
  listDeliveryNoteArtifacts,
  listEstimateArtifacts,
  listInvoiceArtifacts,
  preparePaymentReceipt,
} from '../../../api/generated/sales/sales'
import type { Outcome } from '../../../components/management/bulk-actions'
import type { SalesBulkResource, SalesBulkRow } from './sales-bulk-actions'

const MAX_BYTES = 50 * 1024 * 1024
export const canDownloadPdf = (row: SalesBulkRow) =>
  'receiptIssuedAt' in row ? Boolean(row.receiptIssuedAt) : row.status !== 'draft'

export async function collectPdfArchive(
  resource: SalesBulkResource,
  rows: SalesBulkRow[],
  progress: (done: number) => void,
  message: (key: string) => string,
) {
  const files: Record<string, Uint8Array> = Object.create(null)
  const outcomes: Outcome[] = []
  let bytes = 0
  for (const [index, row] of rows.entries()) {
    const name = ('receiptNumber' in row ? row.receiptNumber : row.number) || row.id
    if (!canDownloadPdf(row)) {
      outcomes.push({ name, status: 'skipped', reason: message('zipIneligible') })
    } else
      try {
        let artifactId: string
        if (resource === 'payments') {
          // Never issue a new receipt as a side effect of a bulk download.
          if (!('receiptIssuedAt' in row) || !row.receiptIssuedAt) throw new Error('zipIneligible')
          artifactId = (await preparePaymentReceipt(row.id, { timeout: 60_000 })).id
        } else {
          const list = {
            invoices: listInvoiceArtifacts,
            estimates: listEstimateArtifacts,
            delivery_notes: listDeliveryNoteArtifacts,
          }[resource]
          const artifacts = await list(row.id)
          const current = artifacts
            .filter(
              (file) =>
                file.format === 'pdf' &&
                'contentVersion' in row &&
                file.sourceVersion === row.contentVersion,
            )
            .sort((a, b) => b.generatedAt.localeCompare(a.generatedAt))[0]
          if (!current) throw new Error('zipMissing')
          if (bytes + current.byteSize > MAX_BYTES) throw new Error('zipLimit')
          artifactId = current.id
        }
        const blob = await downloadArtifact(artifactId, { timeout: 60_000 })
        if (bytes + blob.size > MAX_BYTES) throw new Error('zipLimit')
        const data = new Uint8Array(await blob.arrayBuffer())
        if (String.fromCharCode(...data.slice(0, 5)) !== '%PDF-') throw new Error('zipInvalid')
        // A numbered prefix avoids collisions; sanitize names so no archive entry can be a path.
        files[`${index + 1}-${name.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 100)}.pdf`] = data
        bytes += data.byteLength
        outcomes.push({ name, status: 'success' })
      } catch (error) {
        const code =
          error instanceof Error && ['zipMissing', 'zipLimit', 'zipInvalid'].includes(error.message)
            ? error.message
            : 'zipFailed'
        outcomes.push({ name, status: 'failed', reason: message(code) })
      }
    progress(outcomes.length)
  }
  // PDFs are already compressed. Store without recompression to avoid expensive CPU work.
  const archive = Object.keys(files).length
    ? new Blob([zipSync(files, { level: 0 })], { type: 'application/zip' })
    : null
  return { archive, outcomes }
}
