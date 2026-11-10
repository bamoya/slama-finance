import { Check, Copy } from 'lucide-react'
import { useState } from 'react'

import { Button } from '../../../../../components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '../../../../../components/ui/dialog'
import { translate, useUiLanguage } from '../../../../../lib/i18n'

/** Shows the new recovery codes once. The parent drops them from memory when this closes. */
export function RecoveryCodesDialog({ codes, onClose }: { codes: string[]; onClose: () => void }) {
  useUiLanguage()
  const [copied, setCopied] = useState(false)
  const copy = () => {
    void navigator.clipboard
      ?.writeText(codes.join('\n'))
      .then(() => setCopied(true))
      .catch(() => {})
  }
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className={document.documentElement.classList.contains('theme-dark') ? 'is-dark' : ''}
      >
        <div className="flex flex-col gap-content">
          <DialogTitle>{translate('Your recovery codes')}</DialogTitle>
          <DialogDescription>
            {translate(
              'Keep these codes somewhere safe. Each one works once and they will not be shown again. Earlier codes no longer work.',
            )}
          </DialogDescription>
          <ul
            aria-label={translate('Recovery codes')}
            className="grid grid-cols-1 gap-2 rounded-xl bg-[var(--accent-soft)] p-3 font-mono text-sm sm:grid-cols-2"
          >
            {codes.map((code) => (
              <li key={code}>{code}</li>
            ))}
          </ul>
          <div className="flex flex-wrap justify-end gap-3">
            <Button type="button" variant="outline" onClick={copy}>
              {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
              {translate(copied ? 'Copied' : 'Copy')}
            </Button>
            <Button type="button" onClick={onClose}>
              {translate('I have saved these codes')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
