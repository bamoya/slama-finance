import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'

import { useUiLanguage } from '../../../../lib/i18n'
import type { Session } from '../api/auth-client'
import { sessionKey } from '../hooks/use-session'
import { publishSessionMessage, readSessionMessage, rememberSessionExpiry } from '../session-sync'
import { IdleSession } from './idle-session'

/** The transport reports expiry without depending on feature or router code. */
export function SessionEvents() {
  useUiLanguage()

  const client = useQueryClient()
  useEffect(() => {
    const expire = (event: Event) => {
      const session = client.getQueryData<Session | null>(sessionKey)
      const inactivity = event instanceof CustomEvent && event.detail?.reason === 'inactivity'
      if (inactivity) rememberSessionExpiry()
      if (session)
        publishSessionMessage({
          userId: session.user.id,
          type: inactivity ? 'inactivity' : 'logout',
        })
      void client.cancelQueries().then(() => {
        client.removeQueries({ predicate: (query) => query.queryKey[0] !== sessionKey[0] })
        client.setQueryData(sessionKey, null)
      })
    }
    const sync = (event: StorageEvent) => {
      const message = readSessionMessage(event)
      const session = client.getQueryData<Session | null>(sessionKey)
      if (!message || message.userId !== session?.user.id || message.type === 'activity') return
      if (message.type === 'inactivity') rememberSessionExpiry()
      void client.cancelQueries().then(() => {
        client.removeQueries({ predicate: (query) => query.queryKey[0] !== sessionKey[0] })
        client.setQueryData(sessionKey, null)
      })
    }
    window.addEventListener('slama:session-expired', expire)
    window.addEventListener('storage', sync)
    return () => {
      window.removeEventListener('slama:session-expired', expire)
      window.removeEventListener('storage', sync)
    }
  }, [client])
  return <IdleSession />
}
