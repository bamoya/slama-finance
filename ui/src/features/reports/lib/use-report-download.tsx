import { Download } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import type { ReportAnalysis } from '../../../api/generated/schemas/reporting/reporting.schemas'
import { Button } from '../../../components/ui/button'
import { Select, SelectGroup, SelectOption } from '../../../components/ui/select'
import { translate } from '../../../lib/i18n'
import { Can } from '../../identity'
import { exportReport } from '../api/queries'
import { downloadReport } from './download'

export function useReportDownload(snapshot?: ReportAnalysis) {
  const { t } = useTranslation('reportVisuals')
  const [busy, setBusy] = useState(false),
    [error, setError] = useState<unknown>()
  const [language, setLanguage] = useState<'company' | 'fr' | 'en'>('company')
  const download = async (format: 'pdf' | 'xlsx') => {
    if (!snapshot || busy) return
    setBusy(true)
    setError(undefined)
    try {
      const { start: _start, endExclusive: _end, ...input } = snapshot.filters
      const blob = await exportReport(
        { ...input, format, language },
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
      <Select
        aria-label={translate('Export language')}
        value={language}
        onValueChange={(next) => {
          if (next === 'company' || next === 'fr' || next === 'en') setLanguage(next)
        }}
        className="w-auto min-w-36"
      >
        <SelectGroup>
          <SelectOption value="company">{translate('Company defaults')}</SelectOption>
          <SelectOption value="fr">{translate('French')}</SelectOption>
          <SelectOption value="en">{translate('English')}</SelectOption>
        </SelectGroup>
      </Select>
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
