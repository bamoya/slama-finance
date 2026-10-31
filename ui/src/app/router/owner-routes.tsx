import { Route } from 'wouter'

import {
  OwnerAccountPage,
  OwnerDashboardPage,
  OwnerOnboardingPage,
  OwnerOrganizationPage,
  OwnerOrganizationsPage,
  OwnerSubscriptionPage,
} from '../../features/platform'
import { ownerAuthPaths } from '../../lib/public-paths'
import { OwnerAccess, OwnerInvitationAccess } from './owner-access'

/** Owner site (app.<platform domain>). */
export const ownerRoutes = (
  <>
    <Route path={ownerAuthPaths.login}>
      <OwnerAccess key="login" mode="login" />
    </Route>
    <Route path={ownerAuthPaths.register}>
      <OwnerAccess key="register" mode="register" />
    </Route>
    <Route path={ownerAuthPaths.forgot}>
      <OwnerAccess key="forgot" mode="forgot" />
    </Route>
    <Route path={ownerAuthPaths.reset}>
      <OwnerAccess key="reset" mode="reset" />
    </Route>
    <Route path={ownerAuthPaths.verify}>
      <OwnerAccess key="verify" mode="verify" />
    </Route>
    <Route path={ownerAuthPaths.resend}>
      <OwnerAccess key="resend" mode="resend" />
    </Route>
    <Route path={ownerAuthPaths.acceptInvitation} component={OwnerInvitationAccess} />
    <Route path="/account" component={OwnerAccountPage} />
    <Route path="/organizations/new">
      <OwnerOnboardingPage />
    </Route>
    <Route path="/organizations/:organizationId/setup">
      {({ organizationId }) => (
        <OwnerOnboardingPage key={organizationId} organizationId={organizationId} />
      )}
    </Route>
    <Route path="/organizations/:organizationId">
      {({ organizationId }) => (
        <OwnerOrganizationPage key={organizationId} organizationId={organizationId} />
      )}
    </Route>
    <Route path="/organizations" component={OwnerOrganizationsPage} />
    <Route path="/subscription" component={OwnerSubscriptionPage} />
    <Route path="/" component={OwnerDashboardPage} />
  </>
)
