import { Route, Switch } from 'wouter'

import { NotFoundPage } from '../pages/not-found-page'
import { publicRoutes } from '../router/public-routes'

export default function PublicSite() {
  return (
    <Switch>
      {publicRoutes}
      <Route>
        <NotFoundPage />
      </Route>
    </Switch>
  )
}
