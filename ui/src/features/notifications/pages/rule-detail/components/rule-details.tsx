import { useTranslation } from 'react-i18next'

import { Can } from '../../../../identity'
import type { NotificationRule } from '../../../../settings'
import { RuleEmailPreview } from '../../../components/rule-email-preview'

export function RuleDetails({ rule }: { rule: NotificationRule }) {
  const { t } = useTranslation('notifications')
  const values = [
    [t('senderName'), rule.senderName],
    [t('senderEmail'), rule.senderEmail],
    [t('locale'), t(rule.locale === 'ar-MA' ? 'localeArabic' : 'localeFrench')],
    [t('subjectTemplate'), rule.subjectTemplate],
    ...(rule.timingSupported
      ? [
          [t('offsetDays'), String(rule.offsetDays)],
          [
            t('repeatEveryDays'),
            rule.repeatEveryDays === null ? t('noRepeat') : String(rule.repeatEveryDays),
          ],
        ]
      : []),
  ]
  return (
    <div className="grid min-w-0 items-start gap-content xl:grid-cols-[minmax(0,.8fr)_minmax(0,1.2fr)]">
      <section className="grid min-w-0 gap-4 rounded-panel border border-border bg-[var(--surface)] p-panel">
        <h3 className="font-semibold">{t('configuration')}</h3>
        <dl className="grid gap-4 sm:grid-cols-2">
          {values.map(([label, value]) => (
            <div key={label} className="min-w-0">
              <dt className="text-sm text-muted-foreground">{label}</dt>
              <dd className="mt-1 break-words text-sm font-medium">{value}</dd>
            </div>
          ))}
        </dl>
        {rule.timingSupported && <p className="text-xs text-muted-foreground">{t('timingHint')}</p>}
        <p className="break-words text-xs text-muted-foreground">
          {t('variables', {
            variables: rule.variables.map((variable) => `{{${variable}}}`).join(', '),
          })}
        </p>
        <p className="text-xs text-muted-foreground">{t('testHint')}</p>
      </section>
      <section className="grid min-w-0 gap-4 rounded-panel border border-border bg-[var(--surface)] p-panel">
        <Can permission="notification_rules.update">
          <RuleEmailPreview id={rule.id} value={{ ...rule, expectedVersion: rule.version }} />
        </Can>
        <details>
          <summary className="cursor-pointer text-sm font-semibold">{t('savedContent')}</summary>
          <pre className="mt-3 whitespace-pre-wrap break-words text-xs">{rule.bodyTemplate}</pre>
        </details>
      </section>
    </div>
  )
}
