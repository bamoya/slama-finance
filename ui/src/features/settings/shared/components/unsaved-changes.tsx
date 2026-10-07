import { useEffect, useState } from 'react'
import { useLocation } from 'wouter'

import { Button } from '../../../../components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '../../../../components/ui/dialog'
import { translate, useUiLanguage } from '../../../../lib/i18n'

export function UnsavedChanges({ dirty }: { dirty: boolean }) {
  useUiLanguage()

  const [, navigate] = useLocation()
  const [destination, setDestination] = useState<string | null>(null)
  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    const follow = (event: MouseEvent) => {
      if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey)
        return
      const anchor = event.target instanceof Element ? event.target.closest('a[href]') : null
      if (
        !(anchor instanceof HTMLAnchorElement) ||
        anchor.target === '_blank' ||
        anchor.hasAttribute('download')
      )
        return
      const url = new URL(anchor.href)
      if (url.href === window.location.href) return
      event.preventDefault()
      event.stopPropagation()
      setDestination(
        url.origin === window.location.origin
          ? `${url.pathname}${url.search}${url.hash}`
          : url.href,
      )
    }
    window.addEventListener('beforeunload', warn)
    document.addEventListener('click', follow, true)
    return () => {
      window.removeEventListener('beforeunload', warn)
      document.removeEventListener('click', follow, true)
    }
  }, [dirty])
  return (
    <Dialog
      open={!!destination}
      onOpenChange={(open) => {
        if (!open) setDestination(null)
      }}
    >
      <DialogContent className={localStorage.getItem('slama-theme') === 'dark' ? 'is-dark' : ''}>
        <DialogTitle>{translate('Discard unsaved changes?')}</DialogTitle>
        <DialogDescription className="mt-3 text-sm text-[var(--muted)]">
          {translate(
            'Your changes have not been saved. Stay to continue editing or discard them to leave this page.',
          )}
        </DialogDescription>
        <div className="mt-6 flex justify-end gap-3">
          <Button
            type="button"
            variant="outline"

            onClick={() => setDestination(null)}
          >
            {translate('Keep editing')}
          </Button>
          <Button
            type="button"
            variant="destructive"

            onClick={() => {
              if (destination?.startsWith('/')) navigate(destination)
              else if (destination) window.location.assign(destination)
              setDestination(null)
            }}
          >
            {translate('Discard changes')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
