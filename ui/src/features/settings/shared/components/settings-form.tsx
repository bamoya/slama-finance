import { useForm } from '@tanstack/react-form'
import { Save } from 'lucide-react'
import { useId } from 'react'
import { useState } from 'react'
import { Link } from 'wouter'

import { FormActionBar } from '../../../../components/management/form-action-bar'
import { FormError } from '../../../../components/management/form-error'
import { Button, buttonVariants } from '../../../../components/ui/button'
import { ColorPicker } from '../../../../components/ui/color-picker'
import { Combobox } from '../../../../components/ui/combobox'
import { Input } from '../../../../components/ui/input'
import { Label } from '../../../../components/ui/label'
import { Select, SelectOption } from '../../../../components/ui/select'
import { Switch } from '../../../../components/ui/switch'
import { Textarea } from '../../../../components/ui/textarea'
import { ApiError } from '../../../../lib/api-error'
import { validationMessage } from '../../../../lib/error-messages'
import { translate, useUiLanguage } from '../../../../lib/i18n'
import { AssetField } from '../../assets/components/asset-field'
import { DensityPicker } from '../../document-templates/components/density-picker'
import { LayoutPicker } from '../../document-templates/components/layout-picker'
import { PreviewPane } from '../../document-templates/components/template-preview'
import { SettingsColumns } from './settings-layout'
import { UnsavedChanges } from './unsaved-changes'

export type SettingsField = {
  hidden?: boolean
  column?: 'side'
  name: string
  label: string
  type?:
    | 'text'
    | 'email'
    | 'number'
    | 'select'
    | 'combobox'
    | 'boolean'
    | 'textarea'
    | 'logo'
    | 'signature'
    | 'layout'
    | 'density'
    | 'color'
  nullable?: boolean
  options?: { value: string; label: string }[]
  hint?: string
  section?: string
  disabled?: boolean
  loading?: boolean
  error?: boolean
  onRetry?: () => void
}
type Validator = {
  safeParse: (
    value: unknown,
  ) =>
    | { success: true; data: unknown }
    | { success: false; error: { issues: { path: (string | number)[]; message: string }[] } }
}
export function SettingsForm({
  fields,
  initial,
  schema,
  onSubmit,
  readOnly = false,
  preview = false,
  onReload,
  cancelHref,
}: {
  cancelHref?: string
  fields: SettingsField[]
  initial: Record<string, unknown>
  schema: Validator
  onSubmit: (values: Record<string, unknown>) => Promise<void>
  readOnly?: boolean
  preview?: boolean
  onReload: () => Promise<void>
}) {
  useUiLanguage()

  const actionFormId = useId()
  const [error, setError] = useState<unknown>()
  const [issues, setIssues] = useState<Record<string, string>>({})
  const [busyAssets, setBusyAssets] = useState<Record<string, boolean>>({})
  const busy = Object.values(busyAssets).some(Boolean)
  const form = useForm({
    defaultValues: initial,
    onSubmit: async ({ value }) => {
      if (busy || readOnly) return
      setError(undefined)
      const result = schema.safeParse(value)
      setIssues(
        result.success
          ? {}
          : Object.fromEntries(
              result.error.issues.map((issue) => [
                issue.path.join('.'),
                validationMessage(issue.message),
              ]),
            ),
      )
      if (!result.success) return
      try {
        await onSubmit(result.data as Record<string, unknown>)
      } catch (reason) {
        setError(reason)
      }
    },
  })
  return (
    <form
      id={actionFormId}
      noValidate
      className="space-y-section"
      onSubmit={(event) => {
        event.preventDefault()
        if (!form.state.isSubmitting) void form.handleSubmit()
      }}
    >
      <form.Subscribe selector={(state) => state.isSubmitting}>
        {(pending) => (
          <fieldset disabled={pending || readOnly} className="min-w-0">
            <SettingsColumns
              fields={fields}
              preview={
                preview ? (
                  <form.Subscribe selector={(state) => state.values}>
                    {(values) => <PreviewPane values={values} />}
                  </form.Subscribe>
                ) : undefined
              }
              renderField={(config) => (
                <form.Field key={config.name} name={config.name}>
                  {(field) => (
                    <div
                      className={
                        ['textarea', 'logo', 'signature', 'layout', 'density', 'color'].includes(
                          config.type ?? '',
                        )
                          ? 'min-w-0 sm:col-span-full'
                          : 'min-w-0'
                      }
                    >
                      <Label htmlFor={config.name}>{config.label}</Label>
                      <div className="mt-2">
                        {config.type === 'layout' ? (
                          <LayoutPicker
                            value={String(field.state.value)}
                            onChange={field.handleChange}
                          />
                        ) : config.type === 'density' ? (
                          <DensityPicker
                            value={String(field.state.value)}
                            onChange={field.handleChange}
                          />
                        ) : config.type === 'logo' || config.type === 'signature' ? (
                          <AssetField
                            kind={config.type}
                            value={typeof field.state.value === 'string' ? field.state.value : null}
                            onChange={field.handleChange}
                            disabled={readOnly}
                            onBusy={(value) =>
                              setBusyAssets((current) => ({ ...current, [config.name]: value }))
                            }
                          />
                        ) : config.type === 'color' ? (
                          <ColorPicker
                            id={config.name}
                            aria-label={config.label}
                            aria-invalid={!!issues[config.name]}
                            disabled={config.disabled}
                            value={String(field.state.value ?? '')}
                            onValueChange={field.handleChange}
                            onBlur={field.handleBlur}
                          />
                        ) : config.type === 'boolean' ? (
                          <Switch
                            id={config.name}
                            checked={field.state.value === true}
                            onCheckedChange={field.handleChange}
                          />
                        ) : config.type === 'combobox' ? (
                          <Combobox
                            id={config.name}
                            aria-label={config.label}
                            disabled={config.disabled}
                            value={String(field.state.value ?? '')}
                            onValueChange={(value) =>
                              field.handleChange(config.nullable && !value ? null : value)
                            }
                            options={config.options ?? []}
                            placeholder={config.nullable ? translate('None') : config.label}
                            clearLabel={config.nullable ? translate('None') : undefined}
                            loading={config.loading}
                            error={config.error}
                            onRetry={config.onRetry}
                          />
                        ) : config.type === 'select' ? (
                          <Select
                            id={config.name}
                            disabled={config.disabled}
                            value={String(field.state.value ?? '')}
                            onValueChange={(value) =>
                              field.handleChange(config.nullable && !value ? null : value)
                            }
                          >
                            {config.nullable && (
                              <SelectOption value="">{translate('None')}</SelectOption>
                            )}
                            {config.options?.map((option) => (
                              <SelectOption key={option.value} value={option.value}>
                                {option.label}
                              </SelectOption>
                            ))}
                          </Select>
                        ) : config.type === 'textarea' ? (
                          <Textarea
                            id={config.name}
                            className="min-h-24"
                            value={String(field.state.value ?? '')}
                            onChange={(event) =>
                              field.handleChange(
                                config.nullable && !event.target.value ? null : event.target.value,
                              )
                            }
                          />
                        ) : (
                          <Input
                            id={config.name}
                            type={config.type ?? 'text'}
                            value={String(field.state.value ?? '')}
                            aria-invalid={!!issues[config.name]}
                            onChange={(event) =>
                              field.handleChange(
                                config.nullable && event.target.value === ''
                                  ? null
                                  : config.type === 'number' && event.target.value !== ''
                                    ? Number(event.target.value)
                                    : event.target.value,
                              )
                            }
                          />
                        )}
                      </div>
                      {config.hint && (
                        <p className="mt-2 text-xs text-[var(--muted)]">{config.hint}</p>
                      )}
                      {issues[config.name] && (
                        <p role="alert" className="mt-1 text-sm text-[var(--error-text)]">
                          {issues[config.name]}
                        </p>
                      )}
                    </div>
                  )}
                </form.Field>
              )}
            />
          </fieldset>
        )}
      </form.Subscribe>
      <FormError error={error} />
      {error instanceof ApiError && error.code === 'STALE_VERSION' && (
        <Button
          type="button"
          variant="outline"

          onClick={() => void onReload().catch(setError)}
        >
          {translate('Discard edits and reload latest')}
        </Button>
      )}
      <form.Subscribe selector={(state) => state.values}>
        {(values) => (
          <UnsavedChanges
            dirty={!readOnly && (busy || JSON.stringify(values) !== JSON.stringify(initial))}
          />
        )}
      </form.Subscribe>
      {!readOnly && (
        <form.Subscribe selector={(state) => state.isSubmitting}>
          {(pending) => (
            <FormActionBar>
              {cancelHref && (
                <Link href={cancelHref} className={buttonVariants({ variant: 'outline' })}>
                  {translate('Cancel')}
                </Link>
              )}
              <Button type="submit" form={actionFormId} disabled={pending || busy}>
                <Save size={16} aria-hidden="true" />
                {pending ? translate('Saving…') : translate('Save changes')}
              </Button>
            </FormActionBar>
          )}
        </form.Subscribe>
      )}
    </form>
  )
}
