import { useEffect, useRef, useState } from 'react'

import { FormError } from '../../../../components/management/form-error'
import { Button } from '../../../../components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '../../../../components/ui/dialog'
import { ApiError } from '../../../../lib/api-error'
import { translate, useUiLanguage } from '../../../../lib/i18n'
import { recordActivity } from '../api/auth-client'
import { useLogout } from '../hooks/use-logout'
import { useSession } from '../hooks/use-session'
import { createIdleMonitor } from '../idle-monitor'
import { publishSessionMessage, readSessionMessage, sessionSyncKey } from '../session-sync'

export function IdleSession() {
  useUiLanguage()
  const { data: session } = useSession()
  const logout = useLogout()
  const userId = session?.purpose === 'full' ? session.user.id : undefined
  const deadline = session?.idleExpiresAt
  const [remaining, setRemaining] = useState(Infinity)
  const [failed, setFailed] = useState(false)
  const monitor = useRef<ReturnType<typeof createIdleMonitor>>()
  useEffect(() => {
    if (!userId || !deadline) return
    let disposed = false
    const idle = createIdleMonitor({
      deadline: Date.parse(deadline),
      latestDeadline: () => {
        try {
          const message = readSessionMessage({
            key: sessionSyncKey,
            newValue: localStorage.getItem(sessionSyncKey),
          })
          return message?.userId === userId && message.type === 'activity' && message.deadline
            ? Date.parse(message.deadline)
            : NaN
        } catch {
          return NaN
        }
      },
      refresh: async () => {
        let next
        try {
          next = await recordActivity()
          if (!disposed) setFailed(false)
        } catch (error) {
          if (!disposed) {
            setFailed(true)
            if (error instanceof ApiError && error.status === 401)
              window.dispatchEvent(
                new CustomEvent('slama:session-expired', { detail: { reason: 'inactivity' } }),
              )
          }
          throw error
        }
        if (disposed || !next.idleExpiresAt) return NaN
        publishSessionMessage({ userId, type: 'activity', deadline: next.idleExpiresAt })
        return Date.parse(next.idleExpiresAt)
      },
      onTick: setRemaining,
      onExpired: () => {
        window.dispatchEvent(
          new CustomEvent('slama:session-expired', { detail: { reason: 'inactivity' } }),
        )
      },
    })
    monitor.current = idle
    const activity = (event: Event) => {
      if (event.target instanceof Element && event.target.closest('[data-idle-warning]')) return
      void idle.activity()
    }
    const check = () => idle.check()
    const sync = (event: StorageEvent) => {
      const message = readSessionMessage(event)
      if (message?.userId === userId && message.type === 'activity' && message.deadline) {
        idle.update(Date.parse(message.deadline))
        idle.check()
      }
    }
    const events = ['pointerdown', 'keydown', 'scroll', 'touchstart'] as const
    events.forEach((event) =>
      document.addEventListener(event, activity, { capture: true, passive: true }),
    )
    document.addEventListener('visibilitychange', check)
    window.addEventListener('focus', check)
    window.addEventListener('storage', sync)
    return () => {
      disposed = true
      idle.dispose()
      events.forEach((event) => document.removeEventListener(event, activity, true))
      document.removeEventListener('visibilitychange', check)
      window.removeEventListener('focus', check)
      window.removeEventListener('storage', sync)
    }
  }, [userId, deadline])
  return (
    <Dialog open={!!userId && !!deadline && remaining > 0 && remaining <= 60}>
      <DialogContent
        data-idle-warning
        onEscapeKeyDown={(event) => event.preventDefault()}
        onPointerDownOutside={(event) => event.preventDefault()}
      >
        <DialogTitle className="text-lg font-semibold">
          {translate('Your session is about to expire')}
        </DialogTitle>
        <DialogDescription className="mt-2 text-sm text-[var(--muted)]">
          {translate(
            'You will be signed out due to inactivity in {{seconds}} seconds. Unsaved changes may be lost.',
            { seconds: remaining },
          )}
        </DialogDescription>
        {failed && (
          <p role="alert" className="mt-3 text-sm">
            {translate('Unable to extend your session. Check your connection and try again.')}
          </p>
        )}
        <FormError error={logout.error} />
        <div className="mt-6 flex justify-end gap-3">
          <Button variant="outline" disabled={logout.isPending} onClick={() => logout.mutate()}>
            {translate('Log out')}
          </Button>
          <Button
            onClick={() => {
              void monitor.current?.activity(true)
            }}
          >
            {translate('Stay signed in')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
