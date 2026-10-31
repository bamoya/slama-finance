import { Route } from 'wouter'

import { AcceptInvitationPage } from '../../features/organization/identity'
import {
  OrganizationStaffAuthPage,
  OrganizationUnavailable,
} from '../../features/organization/identity'
import { LoginPage } from '../../features/organization/identity'
import { ChangePasswordPage } from '../../features/organization/identity'
import { ForgotPasswordPage } from '../../features/organization/identity'
import { ResetPasswordPage } from '../../features/organization/identity'
import {
  OwnerAccountPage,
  OwnerDashboardPage,
  OwnerOnboardingPage,
  OwnerOrganizationPage,
  OwnerOrganizationsPage,
  OwnerSubscriptionPage,
} from '../../features/platform'
import { MarketingSite } from '../../features/platform/marketing'
import { ownerAuthPaths } from '../../lib/public-paths'
import { OwnerAccess } from './owner-access'

export const publicRoutes = (
  <>
    <Route
      path={/^\/(?:fonctionnalites|tarifs|contact|confidentialite|conditions|mentions-legales)?$/}
      component={MarketingSite}
    />
    <Route path={ownerAuthPaths.login}>
      <OwnerAccess key="auth-login" mode="login" />
    </Route>
    <Route path={ownerAuthPaths.register}>
      <OwnerAccess key="auth-register" mode="register" />
    </Route>
    <Route path={ownerAuthPaths.forgot}>
      <OwnerAccess key="auth-forgot" mode="forgot" />
    </Route>
    <Route path={ownerAuthPaths.reset}>
      <OwnerAccess key="auth-reset" mode="reset" />
    </Route>
    <Route path={ownerAuthPaths.verify}>
      <OwnerAccess key="auth-verify" mode="verify" />
    </Route>
    <Route path={ownerAuthPaths.resend}>
      <OwnerAccess key="auth-resend" mode="resend" />
    </Route>
    <Route path="/organization-unavailable" component={OrganizationUnavailable} />
    <Route path="/organizations/:organizationId/accept-invitation">
      {({ organizationId }) => (
        <AcceptInvitationPage key={organizationId} organizationId={organizationId} />
      )}
    </Route>
    <Route path="/organizations/:organizationId/login">
      {({ organizationId }) => (
        <OrganizationStaffAuthPage
          key={organizationId + 'login'}
          organizationId={organizationId}
          mode="login"
        />
      )}
    </Route>
    <Route path="/organizations/:organizationId/forgot-password">
      {({ organizationId }) => (
        <OrganizationStaffAuthPage
          key={organizationId + 'forgot-password'}
          organizationId={organizationId}
          mode="forgot"
        />
      )}
    </Route>
    <Route path="/organizations/:organizationId/reset-password">
      {({ organizationId }) => (
        <OrganizationStaffAuthPage
          key={organizationId + 'reset-password'}
          organizationId={organizationId}
          mode="reset"
        />
      )}
    </Route>
    <Route path="/organizations/:organizationId/set-password">
      {({ organizationId }) => (
        <OrganizationStaffAuthPage
          key={organizationId + 'set-password'}
          organizationId={organizationId}
          mode="password"
        />
      )}
    </Route>
    <Route path="/organizations/:organizationId/change-password">
      {({ organizationId }) => (
        <OrganizationStaffAuthPage
          key={organizationId + 'change-password'}
          organizationId={organizationId}
          mode="password"
        />
      )}
    </Route>
    <Route path="/organizations/:organizationId/account">
      {({ organizationId }) => (
        <OrganizationStaffAuthPage
          key={organizationId + 'account'}
          organizationId={organizationId}
          mode="account"
        />
      )}
    </Route>
    <Route path="/owner/login">
      <OwnerAccess key="login" mode="login" />
    </Route>
    <Route path="/owner/register">
      <OwnerAccess key="register" mode="register" />
    </Route>
    <Route path="/owner/forgot-password">
      <OwnerAccess key="forgot" mode="forgot" />
    </Route>
    <Route path="/owner/reset-password">
      <OwnerAccess key="reset" mode="reset" />
    </Route>
    <Route path="/owner/verify-email">
      <OwnerAccess key="verify" mode="verify" />
    </Route>
    <Route path="/owner/resend-verification">
      <OwnerAccess key="resend" mode="resend" />
    </Route>
    <Route path="/owner/account" component={OwnerAccountPage} />
    <Route path="/owner/organizations/new">
      <OwnerOnboardingPage />
    </Route>
    <Route path="/owner/organizations/:organizationId/setup">
      {({ organizationId }) => (
        <OwnerOnboardingPage key={organizationId} organizationId={organizationId} />
      )}
    </Route>
    <Route path="/owner/organizations/:organizationId">
      {({ organizationId }) => (
        <OwnerOrganizationPage key={organizationId} organizationId={organizationId} />
      )}
    </Route>
    <Route path="/owner/organizations" component={OwnerOrganizationsPage} />
    <Route path="/owner/subscription" component={OwnerSubscriptionPage} />
    <Route path="/owner" component={OwnerDashboardPage} />
    <Route path="/login" component={LoginPage} />
    <Route path="/forgot-password" component={ForgotPasswordPage} />
    <Route path="/reset-password" component={ResetPasswordPage} />
    <Route path="/set-password">
      <ChangePasswordPage />
    </Route>
  </>
)
