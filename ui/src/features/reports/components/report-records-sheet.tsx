import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import type { ReportSectionKey } from '../../../api/generated/schemas/reporting/reporting.schemas'
import { RequestState } from '../../../components/management/request-state'
import { Button } from '../../../components/ui/button'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '../../../components/ui/sheet'
import { useUiLanguage } from '../../../lib/i18n'
import type { useAnalysis } from '../api/queries'
import { ReportViewer } from './report-viewer'

export function ReportRecordsSheet({
  detailSection,
  segment,
  details,
  actions,
  set,
}: {
  detailSection?: ReportSectionKey
  segment?: string
  details: ReturnType<typeof useAnalysis>
  actions: ReactNode
  set: (values: Record<string, string | undefined>, page?: boolean) => void
}) {
  useUiLanguage()

  const { t } = useTranslation('reportVisuals'),
    { t: reports } = useTranslation('reports')
  return (
    <Sheet
      open={!!detailSection}
      onOpenChange={(open) => {
        if (!open) set({ detailSection: undefined, segment: undefined, recordDate: undefined })
      }}
    >
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-5xl">
        <SheetHeader>
          <SheetTitle>
            {reports(`sections.${detailSection ?? 'summary'}`)} · {t('records')}
          </SheetTitle>
        </SheetHeader>
        <div className="grid min-w-0 gap-4 p-4">
          <div className="flex flex-wrap gap-2">
            {actions}
            {segment && (
              <Button size="sm" variant="outline" onClick={() => set({ segment: undefined })}>
                {t('all')}
              </Button>
            )}
          </div>
          {details.isPending || details.isError ? (
            <RequestState query={details} />
          ) : (
            <ReportViewer
              data={details.data}
              recordsOnly
              onOffset={(offset) => set({ offset: String(offset) }, true)}
              fetching={details.isFetching}
            />
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
