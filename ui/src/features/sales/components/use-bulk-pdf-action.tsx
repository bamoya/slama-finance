import { Download } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import type { BulkAction } from '../../../components/management/bulk-actions'
import { Button } from '../../../components/ui/button'
import { canDownloadPdf, collectPdfArchive } from './bulk-pdf'
import type { SalesBulkResource, SalesBulkRow } from './sales-bulk-actions'

export function useBulkPdfAction(resource: SalesBulkResource): BulkAction<SalesBulkRow> {
  const { t } = useTranslation('bulk')
  const [archive, setArchive] = useState<Blob | null>(null)
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!archive) {
      setUrl(null)
      return
    }
    const value = URL.createObjectURL(archive)
    setUrl(value)
    return () => URL.revokeObjectURL(value)
  }, [archive])
  return {
    key: 'downloadZip',
    label: t('prepareZip'),
    warning: t('zipDescription'),
    eligible: canDownloadPdf,
    runBatch: async (rows, progress) => {
      setArchive(null)
      const result = await collectPdfArchive(resource, rows, progress, (key) => t(key))
      setArchive(result.archive)
      return result.outcomes
    },
    onDismiss: () => setArchive(null),
    resultContent: url && (
      <Button
        size="sm"
        className="my-2 mr-2"
        onClick={() => {
          const link = document.createElement('a')
          link.href = url
          link.download = `${resource}-${new Date().toISOString().slice(0, 10)}.zip`
          document.body.append(link)
          link.click()
          link.remove()
        }}
      >
        <Download data-icon="inline-start" />
        {t('downloadZip')}
      </Button>
    ),
  }
}
