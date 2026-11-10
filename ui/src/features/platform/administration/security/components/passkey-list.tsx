import { Trash2 } from 'lucide-react'
import { useState } from 'react'

import { removeAdminPasskey } from '../../../../../api/generated/administration/administration'
import type { AdminSecurity } from '../../../../../api/generated/models'
import { Button } from '../../../../../components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '../../../../../components/ui/dialog'
import { translate, useUiLanguage } from '../../../../../lib/i18n'

type Passkey = AdminSecurity['passkeys'][number]

/** Own passkeys by name, each removable after an explicit confirmation. */
export function PasskeyList({
  passkeys,
  onRemoved,
  protectedRun,
}: {
  passkeys: Passkey[]
  onRemoved: () => void
  protectedRun: (action: () => Promise<void>) => Promise<void>
}) {
  const language = useUiLanguage()
  const [removing, setRemoving] = useState<Passkey | null>(null)
  const day = (value: string) => new Date(value).toLocaleDateString(language)
  if (!passkeys.length)
    return <p className="text-sm text-[var(--muted)]">{translate('No passkey registered yet.')}</p>
  return (
    <>
      <ul className="divide-y divide-[var(--border)]" aria-label={translate('Passkeys')}>
        {passkeys.map((passkey) => (
          <li key={passkey.id} className="flex items-center justify-between gap-3 py-3">
            <div className="min-w-0">
              <p className="truncate font-semibold">{passkey.name}</p>
              <p className="text-xs text-[var(--muted)]">
                {translate('Added on {{date}}', { date: day(passkey.createdAt) })}
                {' · '}
                {passkey.lastUsedAt
                  ? translate('Last used on {{date}}', { date: day(passkey.lastUsedAt) })
                  : translate('Never used')}
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              aria-label={translate('Remove {{name}}', { name: passkey.name })}
              onClick={() => setRemoving(passkey)}
            >
              <Trash2 aria-hidden="true" />
              {translate('Remove')}
            </Button>
          </li>
        ))}
      </ul>
      {removing && (
        <Dialog open onOpenChange={(open) => !open && setRemoving(null)}>
          <DialogContent
            className={document.documentElement.classList.contains('theme-dark') ? 'is-dark' : ''}
          >
            <div className="flex flex-col gap-content">
              <DialogTitle>{translate('Remove this passkey?')}</DialogTitle>
              <DialogDescription>
                {translate(
                  '{{name}} will no longer sign you in. Your password and authenticator app still work.',
                  { name: removing.name },
                )}
              </DialogDescription>
              <div className="flex flex-wrap justify-end gap-3">
                <Button type="button" variant="outline" onClick={() => setRemoving(null)}>
                  {translate('Cancel')}
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  onClick={() => {
                    const target = removing
                    setRemoving(null)
                    void protectedRun(async () => {
                      await removeAdminPasskey(target.id)
                      onRemoved()
                    })
                  }}
                >
                  {translate('Remove')}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  )
}
