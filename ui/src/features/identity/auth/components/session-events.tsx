import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'

import { useUiLanguage } from '../../../../lib/i18n'
import { sessionKey } from '../hooks/use-session'

/** The transport reports expiry without depending on feature or router code. */
export function SessionEvents() {
  useUiLanguage()

  const client = useQueryClient()
  useEffect(() => {
    const expire = () => {
      void client.cancelQueries().then(() => {
        client.removeQueries({ predicate: (query) => query.queryKey[0] !== sessionKey[0] })
        client.setQueryData(sessionKey, null)
      })
    }
    window.addEventListener('slama:session-expired', expire)
    return () => window.removeEventListener('slama:session-expired', expire)
  }, [client])
  return null
}
