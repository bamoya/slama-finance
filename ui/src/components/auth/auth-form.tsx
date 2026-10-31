import { useForm } from '@tanstack/react-form'
import { Eye, EyeOff } from 'lucide-react'
import { useId, useState } from 'react'

import { validationMessage } from '../../lib/error-messages'
import { translate, useUiLanguage } from '../../lib/i18n'
import { FormActionBar } from '../management/form-action-bar'
import { FormError } from '../management/form-error'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
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
  revealPasswords = false,
}: {
  fields: Field[]
  schema: { safeParse: (value: unknown) => ValidationResult }
  submitLabel: string
  onSubmit: (value: Record<string, string>) => Promise<void>
  confirm?: boolean
  headerActions?: boolean
  revealPasswords?: boolean
}) {
  useUiLanguage()

  const formId = useId()
  const [visiblePasswords, setVisiblePasswords] = useState<Record<string, boolean>>({})
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
              <div className="auth-field-control">
                <Input
                  id={config.name}
                  name={config.name}
                  type={visiblePasswords[config.name] ? 'text' : (config.type ?? 'password')}
                  autoComplete={config.autoComplete}
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                  aria-invalid={!!validation[config.name]}
                  aria-describedby={validation[config.name] ? `${config.name}-error` : undefined}
                />
                {revealPasswords && config.type === 'password' && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-md"
                    className="auth-password-toggle"
                    aria-label={translate(
                      visiblePasswords[config.name] ? 'Hide password' : 'Show password',
                    )}
                    aria-pressed={!!visiblePasswords[config.name]}
                    onClick={() =>
                      setVisiblePasswords((current) => ({
                        ...current,
                        [config.name]: !current[config.name],
                      }))
                    }
                  >
                    {visiblePasswords[config.name] ? <EyeOff size={17} /> : <Eye size={17} />}
                  </Button>
                )}
              </div>
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
