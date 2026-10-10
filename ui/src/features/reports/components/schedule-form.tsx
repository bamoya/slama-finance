import { useForm } from '@tanstack/react-form'
import { useQueryClient } from '@tanstack/react-query'
import { Save } from 'lucide-react'
import { lazy, Suspense, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useLocation } from 'wouter'

import {
  type ReportSchedule,
  type ReportScheduleInput,
  ReportScheduleInputSchema,
} from '../../../api/generated/schemas/reporting/reporting.schemas'
import { ConflictDialog } from '../../../components/management/conflict-dialog'
import { FormActionBar } from '../../../components/management/form-action-bar'
import { FormError } from '../../../components/management/form-error'
import { Button, buttonVariants } from '../../../components/ui/button'
import { Checkbox } from '../../../components/ui/checkbox'
import { Field, FieldError, FieldGroup, FieldLabel } from '../../../components/ui/field'
import { Input } from '../../../components/ui/input'
import { Select, SelectGroup, SelectOption } from '../../../components/ui/select'
import { Switch } from '../../../components/ui/switch'
import { TimezoneSelect } from '../../../components/ui/timezone-select'
import { ApiError } from '../../../lib/api-error'
import { useUiLanguage } from '../../../lib/i18n'
import { Can, useAuthorization } from '../../identity'
import { refreshSchedules, useReportSections, useScheduleActions } from '../api/queries'
import { RecipientPicker } from './recipient-picker'
import { SchedulePreview } from './schedule-preview'
const ScheduleVisualPreview = lazy(() =>
  import('./schedule-visual-preview').then((module) => ({ default: module.ScheduleVisualPreview })),
)

export function ScheduleForm({
  schedule,
  onReload,
}: {
  schedule?: ReportSchedule
  onReload: () => Promise<unknown>
}) {
  useUiLanguage()

  const { t } = useTranslation('reports'),
    cache = useQueryClient(),
    [, navigate] = useLocation()
  const registry = useReportSections(),
    actions = useScheduleActions()
  const { can } = useAuthorization()
  const [error, setError] = useState<unknown>(),
    [invalid, setInvalid] = useState(false),
    [conflict, setConflict] = useState(false)
  const [expectedVersion] = useState(schedule?.version)
  const [initial] = useState<ReportScheduleInput>(() =>
    schedule
      ? {
          name: schedule.name,
          language: schedule.language ?? 'company',
          output: schedule.output ?? 'pdf',
          frequency: schedule.frequency,
          weekday: schedule.weekday,
          monthDay: schedule.monthDay,
          localTime: schedule.localTime,
          timezone: schedule.timezone,
          period: schedule.period,
          includedSections: schedule.includedSections,
          recipientIds: schedule.recipientIds,
          enabled: schedule.enabled,
        }
      : {
          name: '',
          language: 'company',
          output: 'pdf',
          frequency: 'weekly',
          weekday: 1,
          monthDay: null,
          localTime: '08:00',
          timezone: 'Africa/Casablanca',
          period: 'previous_week',
          includedSections: [],
          recipientIds: [],
          enabled: false,
        },
  )
  const form = useForm({
    defaultValues: initial,
    onSubmit: async ({ value }) => {
      setError(undefined)
      const normalized = {
        ...value,
        weekday: value.frequency === 'weekly' ? value.weekday : null,
        monthDay: value.frequency === 'monthly' ? value.monthDay : null,
      }
      const result = ReportScheduleInputSchema.safeParse(normalized)
      setInvalid(!result.success)
      if (!result.success) return
      try {
        const row = schedule
          ? await actions.update(schedule.id, { ...result.data, expectedVersion: expectedVersion! })
          : await actions.create(result.data)
        await refreshSchedules(cache)
        navigate(`/reports/schedules/${row.id}`)
      } catch (cause) {
        setError(cause)
        if (cause instanceof ApiError && cause.status === 409) setConflict(true)
      }
    },
  })
  return (
    <form
      id="report-schedule-form"
      noValidate
      className="grid gap-section"
      onSubmit={(event) => {
        event.preventDefault()
        if (!form.state.isSubmitting) void form.handleSubmit()
      }}
    >
      <FormError error={error} />
      {invalid && <FieldError>{t('invalid')}</FieldError>}
      <form.Subscribe selector={(state) => state.isSubmitting}>
        {(busy) => (
          <fieldset disabled={busy} className="grid min-w-0 gap-section lg:grid-cols-2">
            <div className="grid min-w-0 content-start gap-section">
              <section className="rounded-panel border border-border bg-[var(--surface)] p-surface md:p-panel">
                <h2 className="mb-5 text-lg font-semibold">{t('configuration')}</h2>
                <FieldGroup>
                  {(['name', 'localTime', 'timezone'] as const).map((name) => (
                    <form.Field key={name} name={name}>
                      {(field) => (
                        <Field>
                          <FieldLabel htmlFor={name}>
                            {t(name === 'name' ? 'scheduleName' : name)}
                          </FieldLabel>
                          {name === 'timezone' ? (
                            <TimezoneSelect
                              id={name}
                              value={field.state.value}
                              onValueChange={(value) => field.handleChange(value)}
                              required
                            />
                          ) : (
                            <Input
                              id={name}
                              type={name === 'localTime' ? 'time' : 'text'}
                              value={field.state.value}
                              onChange={(event) => field.handleChange(event.target.value)}
                              required
                            />
                          )}
                        </Field>
                      )}
                    </form.Field>
                  ))}
                  <form.Field name="language">
                    {(field) => (
                      <Field>
                        <FieldLabel htmlFor="report-language">{t('reportLanguage')}</FieldLabel>
                        <Select
                          id="report-language"
                          value={field.state.value}
                          onValueChange={(value) => {
                            if (value === 'company' || value === 'fr' || value === 'en')
                              field.handleChange(value)
                          }}
                        >
                          <SelectGroup>
                            <SelectOption value="company">{t('languages.company')}</SelectOption>
                            <SelectOption value="fr">{t('languages.fr')}</SelectOption>
                            <SelectOption value="en">{t('languages.en')}</SelectOption>
                          </SelectGroup>
                        </Select>
                      </Field>
                    )}
                  </form.Field>
                  <form.Field name="output">
                    {(field) => (
                      <Field>
                        <FieldLabel htmlFor="report-output">{t('output')}</FieldLabel>
                        <Select
                          id="report-output"
                          value={field.state.value}
                          onValueChange={(value) => {
                            if (value === 'pdf' || value === 'excel' || value === 'both')
                              field.handleChange(value)
                          }}
                        >
                          <SelectGroup>
                            <SelectOption value="pdf">{t('outputs.pdf')}</SelectOption>
                            <SelectOption value="excel">{t('outputs.excel')}</SelectOption>
                            <SelectOption value="both">{t('outputs.both')}</SelectOption>
                          </SelectGroup>
                        </Select>
                      </Field>
                    )}
                  </form.Field>
                  <form.Field name="frequency">
                    {(field) => (
                      <Field>
                        <FieldLabel>{t('frequency')}</FieldLabel>
                        <Select
                          aria-label={t('frequency')}
                          value={field.state.value}
                          onValueChange={(value) => {
                            if (value === 'daily' || value === 'weekly' || value === 'monthly') {
                              field.handleChange(value)
                              form.setFieldValue('weekday', value === 'weekly' ? 1 : null)
                              form.setFieldValue('monthDay', value === 'monthly' ? 1 : null)
                            }
                          }}
                        >
                          <SelectGroup>
                            {['daily', 'weekly', 'monthly'].map((value) => (
                              <SelectOption key={value} value={value}>
                                {t(value)}
                              </SelectOption>
                            ))}
                          </SelectGroup>
                        </Select>
                      </Field>
                    )}
                  </form.Field>
                  <form.Subscribe selector={(state) => state.values.frequency}>
                    {(frequency) =>
                      frequency === 'daily' ? null : (
                        <form.Field name={frequency === 'weekly' ? 'weekday' : 'monthDay'}>
                          {(field) => (
                            <Field>
                              <FieldLabel>
                                {t(frequency === 'weekly' ? 'weekday' : 'monthDay')}
                              </FieldLabel>
                              <Select
                                aria-label={t(frequency === 'weekly' ? 'weekday' : 'monthDay')}
                                value={field.state.value ?? 1}
                                onValueChange={(value) => field.handleChange(Number(value))}
                              >
                                <SelectGroup>
                                  {Array.from(
                                    { length: frequency === 'weekly' ? 7 : 28 },
                                    (_, i) => i + 1,
                                  ).map((value) => (
                                    <SelectOption key={value} value={value}>
                                      {value}
                                    </SelectOption>
                                  ))}
                                </SelectGroup>
                              </Select>
                            </Field>
                          )}
                        </form.Field>
                      )
                    }
                  </form.Subscribe>
                  <form.Field name="period">
                    {(field) => (
                      <Field>
                        <FieldLabel>{t('periodChoice')}</FieldLabel>
                        <Select
                          aria-label={t('periodChoice')}
                          value={field.state.value}
                          onValueChange={(value) => {
                            if (
                              value === 'previous_day' ||
                              value === 'previous_week' ||
                              value === 'previous_month'
                            )
                              field.handleChange(value)
                          }}
                        >
                          <SelectGroup>
                            {['previous_day', 'previous_week', 'previous_month'].map((value) => (
                              <SelectOption key={value} value={value}>
                                {t(value)}
                              </SelectOption>
                            ))}
                          </SelectGroup>
                        </Select>
                      </Field>
                    )}
                  </form.Field>
                  <form.Field name="enabled">
                    {(field) => (
                      <Field>
                        <FieldLabel htmlFor="enabled">{t('enabled')}</FieldLabel>
                        <Switch
                          id="enabled"
                          checked={field.state.value}
                          disabled={!can(field.state.value ? 'reports.read' : 'reports.read')}
                          onCheckedChange={field.handleChange}
                        />
                      </Field>
                    )}
                  </form.Field>
                </FieldGroup>
                <div className="mt-5">
                  <form.Subscribe selector={(state) => state.values}>
                    {(value) => (
                      <SchedulePreview
                        configuration={{
                          frequency: value.frequency,
                          weekday: value.frequency === 'weekly' ? value.weekday : null,
                          monthDay: value.frequency === 'monthly' ? value.monthDay : null,
                          localTime: value.localTime,
                          timezone: value.timezone,
                          period: value.period,
                        }}
                      />
                    )}
                  </form.Subscribe>
                </div>
              </section>
              <section className="grid content-start gap-section rounded-panel border border-border bg-[var(--surface)] p-surface md:p-panel">
                <h2 className="text-lg font-semibold">{t('sectionsTitle')}</h2>
                <form.Field name="includedSections">
                  {(field) => (
                    <div className="grid gap-3 sm:grid-cols-2">
                      {registry.data?.sections.map((section) => (
                        <Can key={section.key} permission={'reports.read'}>
                          <label className="flex items-center gap-2 text-sm">
                            <Checkbox
                              checked={field.state.value.includes(section.key)}
                              disabled={!section.available}
                              onCheckedChange={(checked) => {
                                field.handleChange(
                                  checked
                                    ? [...field.state.value, section.key]
                                    : field.state.value.filter((key) => key !== section.key),
                                )
                                form.setFieldValue('recipientIds', [])
                              }}
                            />
                            {t(`sections.${section.key}`)}
                          </label>
                        </Can>
                      ))}
                    </div>
                  )}
                </form.Field>
                <h2 className="text-lg font-semibold">{t('recipients')}</h2>
                <form.Subscribe selector={(state) => state.values.includedSections}>
                  {(sections) => (
                    <form.Field name="recipientIds">
                      {(field) => (
                        <RecipientPicker
                          sections={sections}
                          value={field.state.value}
                          onChange={field.handleChange}
                        />
                      )}
                    </form.Field>
                  )}
                </form.Subscribe>
              </section>
            </div>
            <form.Subscribe selector={(state) => state.values.includedSections}>
              {(sections) => (
                <Suspense fallback={null}>
                  <ScheduleVisualPreview sections={sections} />
                </Suspense>
              )}
            </form.Subscribe>
          </fieldset>
        )}
      </form.Subscribe>
      <form.Subscribe selector={(state) => state.isSubmitting}>
        {(busy) => (
          <FormActionBar>
            <Link href="/reports/schedules" className={buttonVariants({ variant: 'outline' })}>
              {t('cancel')}
            </Link>
            <Button type="submit" form="report-schedule-form" disabled={busy}>
              <Save data-icon="inline-start" />
              {t(schedule ? 'save' : 'create')}
            </Button>
          </FormActionBar>
        )}
      </form.Subscribe>
      <ConflictDialog
        open={conflict}
        onOpenChange={setConflict}
        onReload={() => {
          void onReload().then(() => setConflict(false))
        }}
      />
    </form>
  )
}
