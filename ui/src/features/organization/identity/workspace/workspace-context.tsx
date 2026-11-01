import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query'
import { type ReactNode, useEffect, useRef, useState } from 'react'
import { Redirect } from 'wouter'

import { useGetWorkspaceSession } from '../../../../api/generated/identity/identity'
import { RequestState } from '../../../../components/management/request-state'
import { Button } from '../../../../components/ui/button'
import { Card, CardContent } from '../../../../components/ui/card'
import { shouldRetryQuery } from '../../../../lib/api-error'
import { translate, useUiLanguage } from '../../../../lib/i18n'
import { WorkspaceContext } from './workspace-state'

function WorkspaceSessionBoundary({ children }: { children: ReactNode }) {
  useUiLanguage()
  const client = useQueryClient()
  const query = useGetWorkspaceSession({
    query: { retry: false, refetchInterval: 60000, refetchOnWindowFocus: 'always' },
  })
  useEffect(() => {
    const leave = (path: string) => () => {
      void client.cancelQueries().finally(() => {
        client.clear()
        window.location.assign(path)
      })
    }
    const unavailable = leave('/organization-unavailable')
    const expired = leave('/login')
    window.addEventListener('slama:organization-unavailable', unavailable)
    window.addEventListener('slama:session-expired', expired)
    return () => {
      window.removeEventListener('slama:organization-unavailable', unavailable)
      window.removeEventListener('slama:session-expired', expired)
    }
  }, [client])
  if (query.isPending)
    return (
      <main className="mx-auto max-w-4xl p-6">
        <RequestState query={query} />
      </main>
    )
  if (query.error?.status === 401) return <Redirect to="~/login" />
  if (query.error || !query.data)
    return (
      <main className="mx-auto max-w-3xl p-6">
        <Card>
          <CardContent className="space-y-4 p-6">
            <h1 className="text-xl font-semibold">{translate('Organization unavailable')}</h1>
            <RequestState query={query} />
            <a href="/login">
              <Button variant="outline">{translate('Back')}</Button>
            </a>
          </CardContent>
        </Card>
      </main>
    )
  return <WorkspaceContext.Provider value={query.data}>{children}</WorkspaceContext.Provider>
}
/** The organization is the site host; one document never changes tenant. */
export function WorkspaceBoundary({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 30000, retry: shouldRetryQuery },
          mutations: { retry: false },
        },
      }),
  )
  const lifetime = useRef(0)
  useEffect(() => {
    const ticket = ++lifetime.current
    return () => {
      queueMicrotask(() => {
        if (lifetime.current === ticket) {
          void client.cancelQueries()
          client.clear()
        }
      })
    }
  }, [client])
  return (
    <QueryClientProvider client={client}>
      <WorkspaceSessionBoundary>{children}</WorkspaceSessionBoundary>
    </QueryClientProvider>
  )
}
