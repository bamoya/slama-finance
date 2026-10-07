import { Blob as NodeBlob } from 'node:buffer'

import { strFromU8, unzipSync } from 'fflate'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { InvoicePageItemsItem, PaymentPageItemsItem } from '../../../api/generated/models'
import { apiRequest } from '../../../api/http'
import { collectPdfArchive } from './bulk-pdf'

vi.mock('../../../api/http', () => ({ apiRequest: vi.fn() }))
const invoice = {
  id: 'invoice1',
  number: '../../FAC/1',
  status: 'issued',
  contentVersion: 2,
} as InvoicePageItemsItem
const artifact = {
  id: 'pdf1',
  format: 'pdf',
  sourceVersion: 2,
  generatedAt: '2026-01-01',
  byteSize: 20,
}
const pdf = new NodeBlob(['%PDF-1.7 test'])
beforeEach(() => {
  vi.stubGlobal('Blob', NodeBlob)
  vi.mocked(apiRequest)
    .mockReset()
    .mockImplementation(async (config) => {
      if (config.url?.endsWith('/artifacts')) return [artifact]
      return pdf
    })
})
describe('Bulk PDF collection using generated clients', () => {
  it.each(['invoices', 'estimates', 'delivery_notes'] as const)(
    'creates a real ZIP for %s, with safe unique file names',
    async (resource) => {
      const result = await collectPdfArchive(resource, [invoice, invoice], vi.fn(), (key) => key)
      expect(result.outcomes.map((r) => r.status)).toEqual(['success', 'success'])
      const files = unzipSync(new Uint8Array(await result.archive!.arrayBuffer()))
      expect(Object.keys(files)).toEqual(['1-______FAC_1.pdf', '2-______FAC_1.pdf'])
      expect(strFromU8(Object.values(files)[0]!)).toBe('%PDF-1.7 test')
    },
  )
  it('skips drafts and never issues unissued receipts', async () => {
    const draft = await collectPdfArchive(
      'invoices',
      [{ ...invoice, status: 'draft' }],
      vi.fn(),
      (key) => key,
    )
    const receipt = await collectPdfArchive(
      'payments',
      [{ id: 'p1', receiptIssuedAt: null } as PaymentPageItemsItem],
      vi.fn(),
      (key) => key,
    )
    expect(draft.outcomes[0]?.status).toBe('skipped')
    expect(receipt.outcomes[0]?.status).toBe('skipped')
    expect(receipt.archive).toBeNull()
    expect(apiRequest).not.toHaveBeenCalled()
  })
  it('uses the existing receipt contract only for already issued receipts', async () => {
    vi.mocked(apiRequest).mockResolvedValueOnce({ id: 'receipt1' }).mockResolvedValueOnce(pdf)
    const result = await collectPdfArchive(
      'payments',
      [{ id: 'p1', receiptIssuedAt: '2026-01-01', receiptNumber: 'REC-1' } as PaymentPageItemsItem],
      vi.fn(),
      (key) => key,
    )
    expect(result.outcomes[0]?.status).toBe('success')
    expect(apiRequest).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ url: '/v1/payments/p1/receipt' }),
      expect.anything(),
    )
  })
  it('chooses the newest matching content version, not an obsolete PDF', async () => {
    vi.mocked(apiRequest)
      .mockResolvedValueOnce([
        { ...artifact, id: 'old', sourceVersion: 1, generatedAt: '2026-03-01' },
        artifact,
        { ...artifact, id: 'new', generatedAt: '2026-02-01' },
      ])
      .mockResolvedValueOnce(pdf)
    await collectPdfArchive('invoices', [invoice], vi.fn(), (key) => key)
    expect(apiRequest).toHaveBeenLastCalledWith(
      expect.objectContaining({ url: '/v1/artifacts/new/download' }),
      expect.anything(),
    )
  })
  it('reports missing files and continues with the rest', async () => {
    vi.mocked(apiRequest)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([artifact])
      .mockResolvedValueOnce(pdf)
    const progress = vi.fn()
    const result = await collectPdfArchive(
      'invoices',
      [invoice, { ...invoice, id: 'invoice2' }],
      progress,
      (key) => key,
    )
    expect(result.outcomes.map((r) => r.status)).toEqual(['failed', 'success'])
    expect(result.outcomes[0]?.reason).toBe('zipMissing')
    expect(result.archive).not.toBeNull()
    expect(progress).toHaveBeenLastCalledWith(2)
  })
  it('rejects invalid responses and oversized downloads', async () => {
    vi.mocked(apiRequest)
      .mockResolvedValueOnce([artifact])
      .mockResolvedValueOnce(new NodeBlob(['not a pdf']))
    const invalid = await collectPdfArchive('invoices', [invoice], vi.fn(), (key) => key)
    expect(invalid.outcomes[0]?.reason).toBe('zipInvalid')
    vi.mocked(apiRequest).mockResolvedValueOnce([{ ...artifact, byteSize: 51 * 1024 * 1024 }])
    const large = await collectPdfArchive('invoices', [invoice], vi.fn(), (key) => key)
    expect(large.outcomes[0]?.reason).toBe('zipLimit')
    expect(large.archive).toBeNull()
  })
})
