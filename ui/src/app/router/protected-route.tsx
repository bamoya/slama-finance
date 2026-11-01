import type { ReactNode } from 'react'
import { Redirect, useLocation } from 'wouter'

import { AppShell } from '../../components/layout/app-shell'
import { ForbiddenState } from '../../components/management/page-state'
import { SessionStatus } from '../../features/organization/identity'
import { useSession } from '../../features/organization/identity'
import { Can, routePermissions } from '../../features/organization/identity'
import { useUiLanguage } from '../../lib/i18n'
import { ComingSoonPage } from '../pages/coming-soon-page'

export function ProtectedRoute({ children }: { children: ReactNode }) {
  useUiLanguage()

  const session = useSession()
  const [path] = useLocation()
  if (session.isPending || session.isError) return <SessionStatus />
  if (!session.data) return <Redirect to="~/login" />
  if (session.data.purpose === 'password_change') return <Redirect to="~/set-password" />
  return (
    <AppShell>
      <Can permission={routePermissions(path)} fallback={<ForbiddenState />}>
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
