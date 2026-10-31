import { Route } from 'wouter'

import { MarketingSite } from '../../features/platform/marketing'

/** Public site (platform domain): marketing pages only. Accounts live on other sites. */
export const publicRoutes = (
  <Route
    path={/^\/(?:fonctionnalites|tarifs|contact|confidentialite|conditions|mentions-legales)?$/}
    component={MarketingSite}
  />
)
