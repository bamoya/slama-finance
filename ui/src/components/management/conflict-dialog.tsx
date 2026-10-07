import { translate, useUiLanguage } from '../../lib/i18n'
import { Button } from '../ui/button'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from '../ui/dialog'

export function ConflictDialog({
  open,
  onOpenChange,
  onReload,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onReload: () => void
}) {
  useUiLanguage()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle className="text-xl font-semibold">
          {translate('This record has changed')}
        </DialogTitle>
        <DialogDescription className="mt-2 text-[var(--muted)]">
          {translate(
            'Your changes were not saved. Reloading replaces your unsaved edits with the latest version.',
          )}
        </DialogDescription>
        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <DialogClose asChild>
            <Button variant="outline">{translate('Keep my edits')}</Button>
          </DialogClose>
          <Button onClick={onReload}>{translate('Discard edits and reload')}</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
