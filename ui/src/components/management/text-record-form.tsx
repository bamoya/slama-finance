import { useForm } from '@tanstack/react-form'
import { useId } from 'react'
import { type ReactNode, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'wouter'

import { validationMessage } from '../../lib/error-messages'
import { useUiLanguage } from '../../lib/i18n'
import { Button, buttonVariants } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { FormActionBar } from './form-action-bar'
import { FormError } from './form-error'
type Field = { name: string; label: string; type?: 'text' | 'email' | 'password'; hint?: string }
type Result =
  | { success: true }
  | { success: false; error: { issues: { path: (string | number)[]; message: string }[] } }
export function TextRecordForm({
  fields,
  initial = {},
  schema,
  submitLabel,
  onSubmit,
  children,
  disabled = false,
  cancelHref,
}: {
  fields: Field[]
  initial?: Record<string, string>
  schema: { safeParse: (value: unknown) => Result }
  submitLabel: string
  onSubmit: (value: Record<string, string>) => Promise<void>
  children?: ReactNode
  disabled?: boolean
  cancelHref?: string
}) {
  useUiLanguage()

  const actionFormId = useId()
  const { t } = useTranslation('pageActions')
  const [error, setError] = useState<unknown>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const form = useForm({
    defaultValues: Object.fromEntries(
      fields.map((field) => [field.name, initial[field.name] ?? '']),
    ),
    onSubmit: async ({ value }) => {
      if (disabled) return
      setError(null)
      const trimmed = Object.fromEntries(
        Object.entries(value).map(([key, entry]) => [
          key,
          fields.find((field) => field.name === key)?.type === 'password' ? entry : entry.trim(),
        ]),
      )
      const result = schema.safeParse(trimmed)
      setErrors(
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
        await onSubmit(trimmed)
      } catch (reason) {
        setError(reason)
      }
    },
  })
  return (
    <form
      id={actionFormId}
      noValidate
      className="flex flex-col gap-section"
      onSubmit={(event) => {
        event.preventDefault()
        if (!form.state.isSubmitting && !disabled) void form.handleSubmit()
      }}
    >
      <form.Subscribe selector={(state) => state.isSubmitting}>
        {(pending) => (
          <fieldset disabled={pending || disabled} className="flex flex-col gap-section">
            <div className="grid gap-content md:grid-cols-2">
              {fields.map((config) => (
                <form.Field key={config.name} name={config.name}>
                  {(field) => (
                    <div className="space-y-2">
                      <Label htmlFor={config.name}>{config.label}</Label>
                      <Input
                        id={config.name}
                        name={config.name}
                        type={config.type ?? 'text'}
                        value={field.state.value}
                        onChange={(event) => field.handleChange(event.target.value)}
                        onBlur={field.handleBlur}
                        aria-invalid={!!errors[config.name]}
                        aria-describedby={`${config.name}-help`}
                      />
                      <p id={`${config.name}-help`} className="text-sm text-[var(--muted)]">
                        {errors[config.name] ? (
                          <span role="alert" className="text-[var(--error-text)]">
                            {errors[config.name]}
                          </span>
                        ) : (
                          config.hint
                        )}
                      </p>
                    </div>
                  )}
                </form.Field>
              ))}
            </div>
            {children}
            <FormError error={error} />
            <FormActionBar>
              {cancelHref && (
                <Link href={cancelHref} className={buttonVariants({ variant: 'outline' })}>
                  {t('cancel')}
                </Link>
              )}
              <Button type="submit" form={actionFormId} disabled={pending || disabled}>
                {pending ? t('saving') : submitLabel}
              </Button>
            </FormActionBar>
          </fieldset>
        )}
      </form.Subscribe>
    </form>
  )
}
