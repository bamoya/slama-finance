import { Download } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import type { ReportAnalysis } from '../../../api/generated/schemas/reporting/reporting.schemas'
import { Button } from '../../../components/ui/button'
import { Can } from '../../identity'
import { exportReport } from '../api/queries'
import { downloadReport } from './download'

export function useReportDownload(snapshot?: ReportAnalysis) {
  const { t, i18n } = useTranslation('reportVisuals')
  const [busy, setBusy] = useState(false),
    [error, setError] = useState<unknown>()
  const download = async (format: 'pdf' | 'xlsx') => {
    if (!snapshot || busy) return
    setBusy(true)
    setError(undefined)
    try {
      const { start: _start, endExclusive: _end, ...input } = snapshot.filters
      const blob = await exportReport(
        { ...input, format, language: i18n.language.startsWith('fr') ? 'fr' : 'en' },
        { responseType: 'blob', timeout: 60000 },
      )
      downloadReport(blob, `report-${input.from}-${input.to}.${format}`)
    } catch (cause) {
      setError(cause)
    } finally {
      setBusy(false)
    }
  }
  const exports = (
    <Can permission="reports.read">
      <Button
        variant="outline"
        size="sm"
        disabled={busy || !snapshot}
        onClick={() => void download('pdf')}
      >
        <Download data-icon="inline-start" />
        {t('exportPdf')}
      </Button>
      <Button
        variant="outline"
        size="sm"
        disabled={busy || !snapshot}
        onClick={() => void download('xlsx')}
      >
        <Download data-icon="inline-start" />
        {t('exportExcel')}
      </Button>
    </Can>
  )
  return { actions: exports, error }
}
