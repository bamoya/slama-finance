import { Route, Switch } from 'wouter'

import { NotFoundPage } from '../pages/not-found-page'
import { ownerRoutes } from '../router/owner-routes'

export default function OwnerSite() {
  return (
    <Switch>
      {ownerRoutes}
      <Route>
        <NotFoundPage />
      </Route>
    </Switch>
  )
}
