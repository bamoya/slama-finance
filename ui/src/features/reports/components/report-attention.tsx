import { AlarmClock, ArrowUpRight, FileClock, Wallet } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import type {
  ReportAnalysis,
  ReportSectionKey,
} from '../../../api/generated/schemas/reporting/reporting.schemas'
import { Button } from '../../../components/ui/button'
import { useUiLanguage } from '../../../lib/i18n'
import { AnalyticsPanel } from './analytics-panel'

export function ReportAttention({
  data,
  onRecords,
}: {
  data: ReportAnalysis
  onRecords?: (section: ReportSectionKey, segment?: string) => void
}) {
  useUiLanguage()

  const { t } = useTranslation('reportVisuals')
  const entries = [
    {
      key: 'overdue' as const,
      icon: AlarmClock,
      label: 'overdueDocuments',
      count: data.sections.find((s) => s.key === 'overdue')?.total,
      segment: undefined,
    },
    {
      key: 'pending_cheques' as const,
      icon: Wallet,
      label: 'pendingDocuments',
      count: data.sections.find((s) => s.key === 'pending_cheques')?.total,
      segment: undefined,
    },
    {
      key: 'estimates' as const,
      icon: FileClock,
      label: 'awaitingDocuments',
      count: data.sections
        .find((s) => s.key === 'estimates')
        ?.visuals?.filter(
          (point) => point.group === 'outcome' && ['issued', 'sent'].includes(point.key),
        )
        .reduce((sum, point) => sum + Number(point.value), 0),
      segment: 'cohort:awaiting',
    },
  ].filter((entry) => entry.count !== undefined)
  if (!entries.length) return null
  return (
    <AnalyticsPanel title={t('attention')} description={t('attentionHint')}>
      <div className="grid gap-3">
        {entries.map(({ key, icon: Icon, label, count, segment }) => (
          <Button
            key={key}
            variant="ghost"
            size="tile"
            disabled={!onRecords || !count}
            onClick={() => onRecords?.(key, segment)}
          >
            <Icon className="text-muted-foreground" />
            <span className="min-w-0 flex-1 whitespace-normal text-left">
              <span className="block">{t(label, { count })}</span>
              <span className="mt-1 block text-xs font-normal text-muted-foreground">
                {t(key === 'estimates' ? 'awaitingScope' : 'captureBasis')}
              </span>
            </span>
            <ArrowUpRight />
          </Button>
        ))}
      </div>
    </AnalyticsPanel>
  )
}
