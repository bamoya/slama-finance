import { Redirect, Route, Switch } from 'wouter'

import {
  AcceptInvitationPage,
  OrganizationStaffAuthPage,
  OrganizationUnavailable,
  WorkspaceBoundary,
} from '../../features/organization/identity'
import { NotFoundPage } from '../pages/not-found-page'
import { protectedRoutes } from './protected-routes'

/** Organization site (<slug>.<platform domain>): staff access and the workspace. */
export const organizationRoutes = (
  <Switch>
    <Route path="/login">
      <OrganizationStaffAuthPage key="login" mode="login" />
    </Route>
    <Route path="/forgot-password">
      <OrganizationStaffAuthPage key="forgot-password" mode="forgot" />
    </Route>
    <Route path="/reset-password">
      <OrganizationStaffAuthPage key="reset-password" mode="reset" />
    </Route>
    <Route path="/set-password">
      <OrganizationStaffAuthPage key="set-password" mode="password" />
    </Route>
    <Route path="/change-password">
      <OrganizationStaffAuthPage key="change-password" mode="password" />
    </Route>
    <Route path="/account">
      <OrganizationStaffAuthPage key="account" mode="account" />
    </Route>
    <Route path="/accept-invitation" component={AcceptInvitationPage} />
    <Route path="/organization-unavailable" component={OrganizationUnavailable} />
    <Route path="/workspace" nest>
      <WorkspaceBoundary>
        <Switch>
          {protectedRoutes}
          <Route>
            <NotFoundPage home="~/workspace/dashboard" label="Back to dashboard" />
          </Route>
        </Switch>
      </WorkspaceBoundary>
    </Route>
    <Route path="/">
      <Redirect to="/workspace/dashboard" />
    </Route>
    <Route>
      <NotFoundPage home="~/workspace/dashboard" label="Back to dashboard" />
    </Route>
  </Switch>
)
