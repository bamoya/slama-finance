import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useLocation } from 'wouter'

import { useUiLanguage } from '../../../../../lib/i18n'
import { sessionKey } from '../hooks/use-session'

/** The transport reports expiry without depending on feature or router code. */
export function SessionEvents() {
  useUiLanguage()

  const client = useQueryClient()
  const [, navigate] = useLocation()
  useEffect(() => {
    const expire = () => {
      void client.cancelQueries().then(() => {
        client.removeQueries({ predicate: (query) => query.queryKey[0] !== sessionKey[0] })
        client.setQueryData(sessionKey, null)
      })
    }
    const unavailable = () => {
      void client.cancelQueries().then(() => {
        client.clear()
        client.setQueryData(sessionKey, null)
        navigate('/organization-unavailable', { replace: true })
      })
    }
    window.addEventListener('slama:organization-unavailable', unavailable)
    window.addEventListener('slama:session-expired', expire)
    return () => {
      window.removeEventListener('slama:session-expired', expire)
      window.removeEventListener('slama:organization-unavailable', unavailable)
    }
  }, [client, navigate])
  return null
}
