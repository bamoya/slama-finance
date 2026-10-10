import { useForm } from '@tanstack/react-form'
import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'wouter'

import { EmailEditor } from '../../../components/email-editor/email-editor'
import { ConflictDialog } from '../../../components/management/conflict-dialog'
import { FormActionBar } from '../../../components/management/form-action-bar'
import { FormError } from '../../../components/management/form-error'
import { Button, buttonVariants } from '../../../components/ui/button'
import { Field, FieldError, FieldGroup, FieldLabel } from '../../../components/ui/field'
import { Input } from '../../../components/ui/input'
import { Select, SelectGroup, SelectOption } from '../../../components/ui/select'
import { Switch } from '../../../components/ui/switch'
import { ApiError } from '../../../lib/api-error'
import { translate, useUiLanguage } from '../../../lib/i18n'
import {
  type NotificationRule,
  type NotificationRuleUpdate,
  NotificationRuleUpdateSchema,
  refreshNotificationRules,
  useNotificationRuleActions,
} from '../../settings'
import { EmailStartingDesign } from './email-starting-design'
import { RuleEmailPreview } from './rule-email-preview'

export function RuleForm({
  rule,
  senders,
  onReload,
  onSaved,
}: {
  rule: NotificationRule
  senders: string[]
  onReload: () => Promise<unknown>
  onSaved: () => void
}) {
  useUiLanguage()

  const { t } = useTranslation('notifications'),
    cache = useQueryClient(),
    actions = useNotificationRuleActions()
  const [snapshot] = useState(rule)
  const [error, setError] = useState<unknown>(),
    [invalid, setInvalid] = useState(false),
    [conflict, setConflict] = useState(false)
  const [editorKey, setEditorKey] = useState(0)
  const [englishOpen, setEnglishOpen] = useState(false)
  const initial: NotificationRuleUpdate = {
    expectedVersion: snapshot.version,
    enabled: snapshot.enabled,
    offsetDays: snapshot.offsetDays,
    repeatEveryDays: snapshot.repeatEveryDays,
    senderName: snapshot.senderName,
    senderEmail: snapshot.senderEmail,
    locale: snapshot.locale,
    subjectTemplate: snapshot.subjectTemplate,
    bodyTemplate: snapshot.bodyTemplate,
    bodyFormat: snapshot.bodyFormat ?? 'text',
    englishSubjectTemplate: snapshot.englishSubjectTemplate ?? null,
    englishBodyTemplate: snapshot.englishBodyTemplate ?? null,
  }
  const form = useForm({
    defaultValues: initial,
    onSubmit: async ({ value }) => {
      setError(undefined)
      const result = NotificationRuleUpdateSchema.safeParse(value)
      setInvalid(!result.success)
      if (!result.success) return
      try {
        await actions.update(rule.id, result.data)
        await refreshNotificationRules(cache)
        onSaved()
      } catch (cause) {
        setError(cause)
        if (cause instanceof ApiError && cause.status === 409) setConflict(true)
      }
    },
  })
  return (
    <>
      <form
        id="notification-rule-form"
        className="grid min-w-0 gap-content rounded-panel border border-border bg-[var(--surface)] p-panel"
        onSubmit={(event) => {
          event.preventDefault()
          if (!form.state.isSubmitting) void form.handleSubmit()
        }}
      >
        <form.Subscribe selector={(state) => state.isSubmitting}>
          {(busy) => (
            <fieldset disabled={busy}>
              <FieldGroup className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                <form.Field name="enabled">
                  {(field) => (
                    <Field>
                      <FieldLabel htmlFor={`enabled-${rule.id}`}>{t('enabledLabel')}</FieldLabel>
                      <Switch
                        id={`enabled-${rule.id}`}
                        checked={field.state.value}
                        onCheckedChange={field.handleChange}
                      />
                    </Field>
                  )}
                </form.Field>
                {(['senderName', 'subjectTemplate'] as const).map((name) => (
                  <form.Field key={name} name={name}>
                    {(field) => (
                      <Field>
                        <FieldLabel htmlFor={`${name}-${rule.id}`}>{t(name)}</FieldLabel>
                        <Input
                          id={`${name}-${rule.id}`}
                          value={field.state.value}
                          required
                          onChange={(event) => field.handleChange(event.target.value)}
                        />
                      </Field>
                    )}
                  </form.Field>
                ))}
                <form.Field name="senderEmail">
                  {(field) => (
                    <Field>
                      <FieldLabel>{t('senderEmail')}</FieldLabel>
                      <Select
                        aria-label={t('senderEmail')}
                        value={field.state.value}
                        onValueChange={field.handleChange}
                      >
                        <SelectGroup>
                          {senders.map((email) => (
                            <SelectOption key={email} value={email}>
                              {email}
                            </SelectOption>
                          ))}
                        </SelectGroup>
                      </Select>
                    </Field>
                  )}
                </form.Field>
                <form.Field name="locale">
                  {(field) => (
                    <Field>
                      <FieldLabel>{t('locale')}</FieldLabel>
                      <Select
                        aria-label={t('locale')}
                        value={field.state.value}
                        onValueChange={(value) => {
                          if (value === 'company' || value === 'fr-MA' || value === 'en-GB')
                            field.handleChange(value)
                        }}
                      >
                        <SelectGroup>
                          <SelectOption value="company">
                            {translate('Company defaults')}
                          </SelectOption>
                          <SelectOption value="fr-MA">{t('localeFrench')}</SelectOption>
                          <SelectOption value="en-GB">{translate('English')}</SelectOption>
                        </SelectGroup>
                      </Select>
                    </Field>
                  )}
                </form.Field>
                {rule.timingSupported && (
                  <>
                    {(['offsetDays', 'repeatEveryDays'] as const).map((name) => (
                      <form.Field key={name} name={name}>
                        {(field) => (
                          <Field>
                            <FieldLabel htmlFor={`${name}-${rule.id}`}>{t(name)}</FieldLabel>
                            <Input
                              type="number"
                              id={`${name}-${rule.id}`}
                              value={field.state.value ?? ''}
                              onChange={(event) =>
                                field.handleChange(
                                  name === 'repeatEveryDays' && event.target.value === ''
                                    ? null
                                    : Number(event.target.value),
                                )
                              }
                            />
                          </Field>
                        )}
                      </form.Field>
                    ))}
                    <p className="text-xs text-muted-foreground">{t('timingHint')}</p>
                  </>
                )}
              </FieldGroup>
              <form.Subscribe selector={(state) => state.values}>
                {(value) => (
                  <div className="mt-5 grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
                    <div className="flex min-w-0 flex-col gap-3">
                      <FieldLabel>
                        {translate('French')} · {t('bodyTemplate')}
                      </FieldLabel>
                      <EmailStartingDesign
                        locale={value.locale}
                        variables={rule.variables}
                        onApply={(html) => {
                          form.setFieldValue('bodyFormat', 'html')
                          form.setFieldValue('bodyTemplate', html)
                          setEditorKey((key) => key + 1)
                        }}
                      />
                      <EmailEditor
                        disabled={busy}
                        key={editorKey}
                        value={value.bodyTemplate}
                        format={value.bodyFormat ?? 'text'}
                        variables={rule.variables}
                        onChange={(html) => {
                          form.setFieldValue('bodyFormat', 'html')
                          form.setFieldValue('bodyTemplate', html)
                        }}
                      />
                      <p className="text-xs text-muted-foreground">
                        {t('variables', {
                          variables: rule.variables.map((variable) => `{{${variable}}}`).join(', '),
                        })}
                      </p>
                    </div>
                    <RuleEmailPreview id={rule.id} value={value} />
                  </div>
                )}
              </form.Subscribe>
              <details
                className="mt-5 rounded-xl border border-border p-4"
                onToggle={(event) => setEnglishOpen(event.currentTarget.open)}
              >
                <summary className="cursor-pointer text-sm font-semibold">
                  {translate('English email content')}
                </summary>
                {englishOpen && (
                  <div className="mt-4 grid gap-4">
                    <form.Field name="englishSubjectTemplate">
                      {(field) => (
                        <Field>
                          <FieldLabel>
                            {translate('English')} · {t('subjectTemplate')}
                          </FieldLabel>
                          <Input
                            value={field.state.value ?? ''}
                            onChange={(event) => field.handleChange(event.target.value || null)}
                          />
                        </Field>
                      )}
                    </form.Field>
                    <form.Field name="englishBodyTemplate">
                      {(field) => (
                        <Field>
                          <FieldLabel>
                            {translate('English')} · {t('bodyTemplate')}
                          </FieldLabel>
                          <EmailEditor
                            disabled={busy}
                            value={field.state.value ?? ''}
                            format="html"
                            variables={rule.variables}
                            onChange={(html) => {
                              field.handleChange(html || null)
                            }}
                          />
                        </Field>
                      )}
                    </form.Field>
                  </div>
                )}
              </details>
            </fieldset>
          )}
        </form.Subscribe>
        <FormError error={error} />
        {invalid && <FieldError>{t('invalid')}</FieldError>}
        <form.Subscribe selector={(state) => state.isSubmitting}>
          {(busy) => (
            <FormActionBar>
              <Link
                href={`/settings/notifications/${rule.id}`}
                className={buttonVariants({ variant: 'outline' })}
                aria-disabled={busy}
                onClick={(event) => {
                  if (busy) event.preventDefault()
                }}
              >
                {t('cancel')}
              </Link>
              <Button type="submit" form="notification-rule-form" disabled={busy}>
                {t(busy ? 'saving' : 'save')}
              </Button>
            </FormActionBar>
          )}
        </form.Subscribe>
      </form>
      <ConflictDialog
        open={conflict}
        onOpenChange={setConflict}
        onReload={() => {
          void onReload().catch(setError)
        }}
      />
    </>
  )
}
