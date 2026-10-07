import { Pencil } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link } from 'wouter'

import { StatusBadge } from '../../../components/management/status-badge'
import { buttonVariants } from '../../../components/ui/button'
import { useUiLanguage } from '../../../lib/i18n'
import { Can } from '../../identity'
import type { NotificationRule } from '../../settings'
import { RuleTestAction } from './rule-test-action'

export function RuleCard({ rule }: { rule: NotificationRule }) {
  useUiLanguage()

  const { t } = useTranslation('notifications')
  const href = `/settings/notifications/${rule.id}`
  return (
    <section className="grid gap-4 rounded-panel border border-border bg-[var(--surface)] p-5 md:p-panel">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">
          <Link href={href} className="hover:underline">
            {t(`events.${rule.eventKey}`)}
          </Link>
        </h2>
        <StatusBadge
          label={t(rule.enabled ? 'enabled' : 'disabled')}
          tone={rule.enabled ? 'active' : 'draft'}
        />
      </div>
      <p className="text-sm text-muted-foreground">
        {rule.senderName} · {rule.senderEmail}
      </p>
      <p className="text-sm">{rule.subjectTemplate}</p>
      <div className="flex flex-wrap gap-2">
        <Can permission="notification_rules.update">
          <Link href={`${href}/edit`} className={buttonVariants({ variant: 'outline' })}>
            <Pencil data-icon="inline-start" />
            {t('configure')}
          </Link>
        </Can>
        <Can permission="notification_rules.update">
          <RuleTestAction id={rule.id} />
        </Can>
      </div>
      <p className="text-xs text-muted-foreground">{t('testHint')}</p>
    </section>
  )
}
