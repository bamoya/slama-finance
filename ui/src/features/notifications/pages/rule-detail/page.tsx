import '../../../../lib/notifications-i18n'

import { Pencil } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useLocation, useParams } from 'wouter'

import { PageHeader } from '../../../../components/management/page-header'
import { EmptyState, ForbiddenState } from '../../../../components/management/page-state'
import { RequestState } from '../../../../components/management/request-state'
import { StatusBadge } from '../../../../components/management/status-badge'
import { buttonVariants } from '../../../../components/ui/button'
import { Can } from '../../../identity'
import { useNotificationRules } from '../../../settings'
import { RuleForm } from '../../components/rule-form'
import { RuleTestAction } from '../../components/rule-test-action'
import { RuleDetails } from './components/rule-details'

export function NotificationRulePage({ edit = false }: { edit?: boolean }) {
  const { ruleId = '' } = useParams<{ ruleId: string }>()
  const { t } = useTranslation('notifications')
  const [, navigate] = useLocation()
  const query = useNotificationRules()
  const [reload, setReload] = useState(0)
  const rule = query.data?.items.find((item) => item.id === ruleId)
  const href = `/settings/notifications/${ruleId}`
  const back = edit ? href : '/settings/notifications'
  return (
    <div className="mx-auto grid min-w-0 max-w-[1500px] gap-section p-page">
      <Link href={back} className="text-sm font-semibold text-muted-foreground">
        {t(edit ? 'backToRule' : 'backToRules')}
      </Link>
      <PageHeader
        eyebrow={t('title')}
        title={
          rule
            ? t(edit ? 'editTitle' : `events.${rule.eventKey}`, {
                event: t(`events.${rule.eventKey}`),
              })
            : t('title')
        }
        description={t('description')}
        backHref={back}
        status={
          rule && (
            <StatusBadge
              label={t(rule.enabled ? 'enabled' : 'disabled')}
              tone={rule.enabled ? 'active' : 'draft'}
            />
          )
        }
        actions={
          !edit &&
          rule && (
            <Can permission="notification_rules.update">
              <RuleTestAction id={rule.id} />
              <Link href={`${href}/edit`} className={buttonVariants({})}>
                <Pencil data-icon="inline-start" />
                {t('configure')}
              </Link>
            </Can>
          )
        }
      />
      {query.isPending || query.isError ? (
        <RequestState query={query} />
      ) : !rule ? (
        <EmptyState title={t('notFound')} />
      ) : edit ? (
        <Can permission="notification_rules.update" fallback={<ForbiddenState />}>
          <RuleForm
            key={`${rule.id}-${reload}`}
            rule={rule}
            senders={query.data.permittedSenderEmails}
            onSaved={() => navigate(href)}
            onReload={async () => {
              const result = await query.refetch()
              if (result.error) throw result.error
              setReload((value) => value + 1)
            }}
          />
        </Can>
      ) : (
        <RuleDetails rule={rule} />
      )}
    </div>
  )
}
