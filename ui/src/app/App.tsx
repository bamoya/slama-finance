import { Route, Router, Switch } from 'wouter'

import { SessionEvents } from '../features/identity'
import { useUiLanguage } from '../lib/i18n'
import { NotFoundPage } from './pages/not-found-page'
import { protectedRoutes } from './router/protected-routes'
import { publicRoutes } from './router/public-routes'

function AppRoutes() {
  useUiLanguage()

  return (
    <Switch>
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
