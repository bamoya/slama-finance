import { X } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { ClientNotificationPreferenceInputSchema } from '../../../api/generated/schemas/clients/notification-preferences.schemas'
import { Button } from '../../../components/ui/button'
import { Input } from '../../../components/ui/input'

export function PreferenceEmailInput({
  id,
  emails,
  pending,
  disabled,
  invalid,
  onChange,
}: {
  id: string
  emails: string[]
  pending: string
  disabled: boolean
  invalid: boolean
  onChange: (emails: string[], pending: string) => void
}) {
  const { t } = useTranslation('notifications')
  const commit = () => {
    const next = [
      ...emails,
      ...pending
        .split(/[,;\n]/)
        .map((value) => value.trim())
        .filter(Boolean),
    ]
    if (ClientNotificationPreferenceInputSchema.shape.cc.safeParse(next).success) onChange(next, '')
  }
  return (
    <div className="grid min-w-0 gap-2">
      {!!emails.length && (
        <div className="flex flex-wrap gap-1.5">
          {emails.map((email, index) => (
            <span
              key={`${email}-${index}`}
              className="inline-flex min-w-0 max-w-full items-center rounded-lg border border-border bg-muted pl-2 text-xs"
            >
              <span className="break-all">{email}</span>
              <Button
                type="button"
                variant="ghost"
                size="icon-md"
                disabled={disabled}
                aria-label={t('removeEmail', { email })}
                onClick={() =>
                  onChange(
                    emails.filter((_, position) => position !== index),
                    pending,
                  )
                }
              >
                <X aria-hidden="true" />
              </Button>
            </span>
          ))}
        </div>
      )}
      <Input
        id={id}
        className="h-control"
        type="text"
        inputMode="email"
        autoComplete="off"
        aria-invalid={invalid}
        aria-describedby={invalid ? `${id}-error` : undefined}
        placeholder={t('addEmail')}
        value={pending}
        disabled={disabled}
        onChange={(event) => onChange(emails, event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ',' || event.key === ';') {
            event.preventDefault()
            commit()
          }
        }}
      />
    </div>
  )
}
