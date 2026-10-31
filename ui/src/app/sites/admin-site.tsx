import { Route, Switch } from 'wouter'

import { NotFoundPage } from '../pages/not-found-page'
import { adminRoutes } from '../router/admin-routes'

export default function AdminSite() {
  return (
    <Switch>
      {adminRoutes}
      <Route>
        <NotFoundPage />
      </Route>
    </Switch>
  )
}
