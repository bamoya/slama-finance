import { Route } from 'wouter'

import {
  AdminAuditLogPage,
  AdminBillingSettingsPage,
  AdminCustomerDetailPage,
  AdminCustomersPage,
  AdminNewCustomerPage,
  AdminOverviewPage,
  AdminPaymentsPage,
  AdminSecurityPage,
  AdminSignInPage,
} from '../../features/platform/administration'

/** Admin site (admin.<platform domain>). */
export const adminRoutes = (
  <>
    <Route path="/login" component={AdminSignInPage} />
    <Route path="/payments" component={AdminPaymentsPage} />
    <Route path="/customers/new" component={AdminNewCustomerPage} />
    <Route path="/customers/:customerId">
      {({ customerId }) => <AdminCustomerDetailPage key={customerId} customerId={customerId} />}
    </Route>
    <Route path="/customers" component={AdminCustomersPage} />
    <Route path="/billing-settings" component={AdminBillingSettingsPage} />
    <Route path="/audit" component={AdminAuditLogPage} />
    <Route path="/security" component={AdminSecurityPage} />
    <Route path="/" component={AdminOverviewPage} />
  </>
)
