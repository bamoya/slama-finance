import { useEffect, useState } from 'react'

import type { TemporaryPassword } from '../../../../api/generated/schemas/identity/staff.schemas'
import { Button } from '../../../../components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '../../../../components/ui/dialog'
import { uiLocale } from '../../../../lib/i18n'
import { translate, useUiLanguage } from '../../../../lib/i18n'
export function TemporaryCredential({
  credential,
  email,
  onDismiss,
}: {
  credential: TemporaryPassword
  email: string
  onDismiss: () => void
}) {
  useUiLanguage()

  const [copied, setCopied] = useState('')
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [])
  return (
    <Dialog open onOpenChange={() => {}}>
      <DialogContent
        className={localStorage.getItem('slama-theme') === 'dark' ? 'is-dark' : ''}
        onEscapeKeyDown={(event) => event.preventDefault()}
        onPointerDownOutside={(event) => event.preventDefault()}
      >
        <DialogTitle className="text-xl font-bold">
          {translate('Save this temporary password')}
        </DialogTitle>
        <DialogDescription className="mt-3 text-sm leading-6 text-[var(--muted)]">
          {translate('Share it securely with')} {email}
          {translate(
            '. It can be used once and requires a new password at first login. No welcome email is sent. It will not be shown again after closing.',
          )}
        </DialogDescription>
        <p className="my-5 select-all break-all rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] p-4 font-mono text-lg">
          {credential.temporaryPassword}
        </p>
        <p className="text-sm text-[var(--muted)]">
          {translate('Expires:')}{' '}
          {new Date(credential.temporaryPasswordExpiresAt).toLocaleString(uiLocale())}
        </p>
        <p role="status" className="mt-2 text-sm">
          {copied}
        </p>
        <div className="mt-5 flex flex-wrap justify-end gap-3">
          <Button
            variant="outline"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(credential.temporaryPassword)
                setCopied('Copied. Clear your clipboard after sharing securely.')
              } catch {
                setCopied('Clipboard unavailable. Select and copy the password manually.')
              }
            }}
          >
            {translate('Copy password')}
          </Button>
          <Button onClick={onDismiss}>{translate('I saved it — close')}</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
