import { useForm } from '@tanstack/react-form'
import { useId, useState } from 'react'

import { FormActionBar } from '../../../../components/management/form-action-bar'
import { FormError } from '../../../../components/management/form-error'
import { Button } from '../../../../components/ui/button'
import { Input } from '../../../../components/ui/input'
import { Label } from '../../../../components/ui/label'
import { validationMessage } from '../../../../lib/error-messages'
import { translate, useUiLanguage } from '../../../../lib/i18n'
type Field = { name: string; label: string; type?: 'email' | 'password'; autoComplete: string }
type ValidationResult =
  | { success: true; data: unknown }
  | { success: false; error: { issues: { path: (string | number)[]; message: string }[] } }
/** Confirmation belongs to UI state and is never sent to the API. */
export function AuthForm({
  fields,
  schema,
  submitLabel,
  onSubmit,
  confirm = false,
  headerActions = false,
}: {
  fields: Field[]
  schema: { safeParse: (value: unknown) => ValidationResult }
  submitLabel: string
  onSubmit: (value: Record<string, string>) => Promise<void>
  confirm?: boolean
  headerActions?: boolean
}) {
  useUiLanguage()

  const formId = useId()
  const [error, setError] = useState<unknown>(null)
  const [validation, setValidation] = useState<Record<string, string>>({})
  const form = useForm({
    defaultValues: Object.fromEntries(fields.map((field) => [field.name, ''])),
    onSubmit: async ({ value }) => {
      setError(null)
      const { confirmation, ...body } = value
      const parsed = schema.safeParse(body)
      const errors: Record<string, string> = parsed.success
        ? {}
        : Object.fromEntries(
            parsed.error.issues.map((issue) => [
              issue.path.join('.'),
              validationMessage(issue.message),
            ]),
          )
      if (confirm && confirmation !== (body.newPassword ?? body.password))
        errors.confirmation = translate('Passwords do not match.')
      setValidation(errors)
      if (Object.keys(errors).length) return
      try {
        await onSubmit(body)
        form.reset()
      } catch (reason) {
        setError(reason)
      }
    },
  })
  return (
    <form
      id={formId}
      noValidate
      className="space-y-content"
      onSubmit={(event) => {
        event.preventDefault()
        if (!form.state.isSubmitting) void form.handleSubmit()
      }}
    >
      {fields.map((config) => (
        <form.Field key={config.name} name={config.name}>
          {(field) => (
            <div className="space-y-2">
              <Label htmlFor={config.name}>{config.label}</Label>
              <Input
                id={config.name}
                name={config.name}
                type={config.type ?? 'password'}
                autoComplete={config.autoComplete}
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(event) => field.handleChange(event.target.value)}
                aria-invalid={!!validation[config.name]}
                aria-describedby={validation[config.name] ? `${config.name}-error` : undefined}
              />
              {validation[config.name] && (
                <p
                  id={`${config.name}-error`}
                  role="alert"
                  className="text-sm text-[var(--error-text)]"
                >
                  {validation[config.name]}
                </p>
              )}
            </div>
          )}
        </form.Field>
      ))}
      <FormError error={error} />
      <form.Subscribe selector={(state) => state.isSubmitting}>
        {(pending) => {
          const submit = (
            <Button
              type="submit"
              form={formId}
              disabled={pending}
              size={headerActions ? 'default' : 'lg'}
              className={headerActions ? undefined : 'w-full'}
            >
              {pending ? translate('Please wait…') : submitLabel}
            </Button>
          )
          return headerActions ? <FormActionBar>{submit}</FormActionBar> : submit
        }}
      </form.Subscribe>
    </form>
  )
}
