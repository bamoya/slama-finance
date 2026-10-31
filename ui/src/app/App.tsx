import { useEffect } from 'react'
import { useLocation } from 'wouter'
import { Route, Router, Switch } from 'wouter'

import { documentWorkspace } from '../api/workspace-scope'
import { WorkspaceBoundary } from '../features/organization/identity'
import { SessionEvents } from '../features/organization/identity'
import { useUiLanguage } from '../lib/i18n'
import { NotFoundPage } from './pages/not-found-page'
import { protectedRoutes } from './router/protected-routes'
import { publicRoutes } from './router/public-routes'

function AppRoutes() {
  useUiLanguage()
  const [path] = useLocation()
  const base = documentWorkspace
    ? `/organizations/${documentWorkspace.organizationId}/workspace`
    : null
  const leaving = !!base && !path.startsWith(base + '/') && path !== base
  useEffect(() => {
    if (leaving) window.location.replace(window.location.href)
  }, [leaving])
  if (leaving) return null

  return (
    <Switch>
      <Route path="/organizations/:organizationId/workspace" nest>
        {({ organizationId }) => (
          <WorkspaceBoundary
            key={organizationId}
            organizationId={organizationId}
            identityType="staff"
          >
            <Switch>
              {protectedRoutes}
              <Route>
                <NotFoundPage />
              </Route>
            </Switch>
          </WorkspaceBoundary>
        )}
      </Route>
      {publicRoutes}
      {protectedRoutes}
      <Route component={NotFoundPage} />
    </Switch>
  )
}

export default function App() {
  useUiLanguage()

  return (
    <Router base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
      <SessionEvents />
      <AppRoutes />
    </Router>
  )
}
