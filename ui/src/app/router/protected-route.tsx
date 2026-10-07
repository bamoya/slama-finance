import type { ReactNode } from 'react'
import { Redirect, useLocation } from 'wouter'

import { AppShell } from '../../components/layout/app-shell'
import { SessionStatus } from '../../features/identity'
import { useSession } from '../../features/identity'
import { Can, routePermissions } from '../../features/identity'
import { translate, useUiLanguage } from '../../lib/i18n'
import { ComingSoonPage } from '../pages/coming-soon-page'

export function ProtectedRoute({ children }: { children: ReactNode }) {
  useUiLanguage()

  const session = useSession()
  const [path] = useLocation()
  if (session.isPending || session.isError) return <SessionStatus />
  if (!session.data) return <Redirect to="/login" />
  if (session.data.purpose === 'password_change') return <Redirect to="/set-password" />
  return (
    <AppShell>
      <Can
        permission={routePermissions(path)}
        fallback={
          <div role="alert" className="p-8">
            {translate('You do not have permission to view this page. Contact your administrator.')}
          </div>
        }
      >
        {children}
      </Can>
    </AppShell>
  )
}

export function ProtectedPage({ title }: { title: string }) {
  useUiLanguage()

  return (
    <ProtectedRoute>
      <ComingSoonPage title={title} />
    </ProtectedRoute>
  )
}
