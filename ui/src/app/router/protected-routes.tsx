import { Route } from 'wouter'

import { ProductDetailPage } from '../../features/organization/catalog'
import { ProductFormPage } from '../../features/organization/catalog'
import { ProductsPage } from '../../features/organization/catalog'
import {
  CategoriesPage,
  CategoryDetailPage,
  CategoryFormPage,
} from '../../features/organization/catalog'
import { ClientDetailPage } from '../../features/organization/clients'
import { ClientFormPage } from '../../features/organization/clients'
import { ClientsPage } from '../../features/organization/clients'
import { DashboardPage } from '../../features/organization/dashboard'
import { ChangePasswordPage } from '../../features/organization/identity'
import { ProfilePage } from '../../features/organization/identity'
import { RoleCreatePage } from '../../features/organization/identity'
import { RolesPage } from '../../features/organization/identity'
import { StaffDetailPage } from '../../features/organization/identity'
import { StaffFormPage } from '../../features/organization/identity'
import { StaffPage } from '../../features/organization/identity'
import { NotificationRulePage, NotificationsPage } from '../../features/organization/notifications'
import { ReportScheduleFormPage } from '../../features/organization/reports'
import { ReportSchedulesPage } from '../../features/organization/reports'
import { LiveReportsPage, ReportsPage } from '../../features/organization/reports'
import { ReportRunPage, ReportScheduleDetailPage } from '../../features/organization/reports'
import {
  PaymentCreatePage,
  PaymentDetailPage,
  PaymentsPage,
} from '../../features/organization/sales'
import {
  DeliveryConvertPage,
  DeliveryNoteDetailPage,
  DeliveryNoteFormPage,
  DeliveryNotesPage,
  EstimateConvertPage,
  EstimateDetailPage,
  EstimateFormPage,
  EstimatesPage,
  InvoiceDetailPage,
  InvoiceFormPage,
  InvoicesPage,
} from '../../features/organization/sales'
import { BankAccountsPage } from '../../features/organization/settings'
import { CompanySettingsPage } from '../../features/organization/settings'
import { DocumentTemplatesPage } from '../../features/organization/settings'
import { SettingsRecordPage } from '../../features/organization/settings'
import { ProtectedRoute } from './protected-route'

export const protectedRoutes = (
  <>
    <Route path="/profile/edit">
      <ProtectedRoute>
        <ProfilePage editing />
      </ProtectedRoute>
    </Route>
    <Route path="/profile/change-password">
      <ProtectedRoute>
        <ChangePasswordPage embedded />
      </ProtectedRoute>
    </Route>
    <Route path="/profile">
      <ProtectedRoute>
        <ProfilePage />
      </ProtectedRoute>
    </Route>
    <Route path="/dashboard">
      <ProtectedRoute>
        <DashboardPage />
      </ProtectedRoute>
    </Route>
    <Route path="/products/new">
      <ProtectedRoute>
        <ProductFormPage />
      </ProtectedRoute>
    </Route>
    <Route path="/products/categories/new">
      <ProtectedRoute>
        <CategoryFormPage />
      </ProtectedRoute>
    </Route>
    <Route path="/products/categories/:categoryId/edit">
      <ProtectedRoute>
        <CategoryFormPage />
      </ProtectedRoute>
    </Route>
    <Route path="/products/categories/:categoryId">
      <ProtectedRoute>
        <CategoryDetailPage />
      </ProtectedRoute>
    </Route>
    <Route path="/products/categories">
      <ProtectedRoute>
        <CategoriesPage />
      </ProtectedRoute>
    </Route>
    <Route path="/products/:productId/edit">
      <ProtectedRoute>
        <ProductFormPage />
      </ProtectedRoute>
    </Route>
    <Route path="/products/:productId">
      <ProtectedRoute>
        <ProductDetailPage />
      </ProtectedRoute>
    </Route>
    <Route path="/products">
      <ProtectedRoute>
        <ProductsPage />
      </ProtectedRoute>
    </Route>
    <Route path="/clients/new">
      <ProtectedRoute>
        <ClientFormPage />
      </ProtectedRoute>
    </Route>
    <Route path="/clients/:clientId/edit">
      <ProtectedRoute>
        <ClientFormPage />
      </ProtectedRoute>
    </Route>
    <Route path="/clients/:clientId">
      <ProtectedRoute>
        <ClientDetailPage />
      </ProtectedRoute>
    </Route>
    <Route path="/clients">
      <ProtectedRoute>
        <ClientsPage />
      </ProtectedRoute>
    </Route>
    <Route path="/invoices/new">
      <ProtectedRoute>
        <InvoiceFormPage />
      </ProtectedRoute>
    </Route>
    <Route path="/invoices/:documentId/edit">
      <ProtectedRoute>
        <InvoiceFormPage />
      </ProtectedRoute>
    </Route>
    <Route path="/invoices/:documentId">
      <ProtectedRoute>
        <InvoiceDetailPage />
      </ProtectedRoute>
    </Route>
    <Route path="/invoices">
      <ProtectedRoute>
        <InvoicesPage />
      </ProtectedRoute>
    </Route>
    <Route path="/estimates/new">
      <ProtectedRoute>
        <EstimateFormPage />
      </ProtectedRoute>
    </Route>
    <Route path="/estimates/:documentId/convert">
      <ProtectedRoute>
        <EstimateConvertPage />
      </ProtectedRoute>
    </Route>
    <Route path="/estimates/:documentId/edit">
      <ProtectedRoute>
        <EstimateFormPage />
      </ProtectedRoute>
    </Route>
    <Route path="/estimates/:documentId">
      <ProtectedRoute>
        <EstimateDetailPage />
      </ProtectedRoute>
    </Route>
    <Route path="/estimates">
      <ProtectedRoute>
        <EstimatesPage />
      </ProtectedRoute>
    </Route>
    <Route path="/delivery-notes/new">
      <ProtectedRoute>
        <DeliveryNoteFormPage />
      </ProtectedRoute>
    </Route>
    <Route path="/delivery-notes/:noteId/convert">
      <ProtectedRoute>
        <DeliveryConvertPage />
      </ProtectedRoute>
    </Route>
    <Route path="/delivery-notes/:noteId/edit">
      <ProtectedRoute>
        <DeliveryNoteFormPage />
      </ProtectedRoute>
    </Route>
    <Route path="/delivery-notes/:noteId">
      <ProtectedRoute>
        <DeliveryNoteDetailPage />
      </ProtectedRoute>
    </Route>
    <Route path="/delivery-notes">
      <ProtectedRoute>
        <DeliveryNotesPage />
      </ProtectedRoute>
    </Route>
    <Route path="/payments/new">
      <ProtectedRoute>
        <PaymentCreatePage />
      </ProtectedRoute>
    </Route>
    <Route path="/payments/:paymentId">
      <ProtectedRoute>
        <PaymentDetailPage />
      </ProtectedRoute>
    </Route>
    <Route path="/payments">
      <ProtectedRoute>
        <PaymentsPage />
      </ProtectedRoute>
    </Route>
    <Route path="/reports/schedules/new">
      <ProtectedRoute>
        <ReportScheduleFormPage />
      </ProtectedRoute>
    </Route>
    <Route path="/reports/schedules/:scheduleId/edit">
      <ProtectedRoute>
        <ReportScheduleFormPage />
      </ProtectedRoute>
    </Route>
    <Route path="/reports/schedules">
      <ProtectedRoute>
        <ReportSchedulesPage />
      </ProtectedRoute>
    </Route>
    <Route path="/reports/schedules/:scheduleId/runs">
      <ProtectedRoute>
        <ReportScheduleDetailPage runsOnly />
      </ProtectedRoute>
    </Route>
    <Route path="/reports/schedules/:scheduleId">
      <ProtectedRoute>
        <ReportScheduleDetailPage />
      </ProtectedRoute>
    </Route>
    <Route path="/reports/runs/:runId">
      <ProtectedRoute>
        <ReportRunPage />
      </ProtectedRoute>
    </Route>
    <Route path="/reports/live">
      <ProtectedRoute>
        <LiveReportsPage />
      </ProtectedRoute>
    </Route>
    <Route path="/reports">
      <ProtectedRoute>
        <ReportsPage />
      </ProtectedRoute>
    </Route>
    <Route path="/settings/staff/new">
      <ProtectedRoute>
        <StaffFormPage />
      </ProtectedRoute>
    </Route>
    <Route path="/settings/staff/:staffId/edit">
      <ProtectedRoute>
        <StaffFormPage />
      </ProtectedRoute>
    </Route>
    <Route path="/settings/staff">
      <ProtectedRoute>
        <StaffPage />
      </ProtectedRoute>
    </Route>
    <Route path="/settings/staff/:staffId">
      <ProtectedRoute>
        <StaffDetailPage />
      </ProtectedRoute>
    </Route>
    <Route path="/settings/roles/new">
      <ProtectedRoute>
        <RoleCreatePage />
      </ProtectedRoute>
    </Route>
    <Route path="/settings/roles/:roleId">
      <ProtectedRoute>
        <RolesPage />
      </ProtectedRoute>
    </Route>
    <Route path="/settings/roles">
      <ProtectedRoute>
        <RolesPage />
      </ProtectedRoute>
    </Route>
    <Route path="/settings/invoice-appearance/new">
      <ProtectedRoute>
        <SettingsRecordPage resource="template" mode="new" />
      </ProtectedRoute>
    </Route>
    <Route path="/settings/invoice-appearance/:recordId/edit">
      <ProtectedRoute>
        <SettingsRecordPage resource="template" mode="edit" />
      </ProtectedRoute>
    </Route>
    <Route path="/settings/invoice-appearance/:recordId">
      <ProtectedRoute>
        <SettingsRecordPage resource="template" mode="view" />
      </ProtectedRoute>
    </Route>
    <Route path="/settings/invoice-appearance">
      <ProtectedRoute>
        <DocumentTemplatesPage />
      </ProtectedRoute>
    </Route>
    <Route path="/settings/notifications/:ruleId/edit">
      <ProtectedRoute>
        <NotificationRulePage edit />
      </ProtectedRoute>
    </Route>
    <Route path="/settings/notifications/:ruleId">
      <ProtectedRoute>
        <NotificationRulePage />
      </ProtectedRoute>
    </Route>
    <Route path="/settings/notifications">
      <ProtectedRoute>
        <NotificationsPage />
      </ProtectedRoute>
    </Route>
    <Route path="/settings/company/edit">
      <ProtectedRoute>
        <CompanySettingsPage edit />
      </ProtectedRoute>
    </Route>
    <Route path="/settings/company">
      <ProtectedRoute>
        <CompanySettingsPage />
      </ProtectedRoute>
    </Route>
    <Route path="/settings/bank-accounts/new">
      <ProtectedRoute>
        <SettingsRecordPage resource="bank" mode="new" />
      </ProtectedRoute>
    </Route>
    <Route path="/settings/bank-accounts/:recordId/edit">
      <ProtectedRoute>
        <SettingsRecordPage resource="bank" mode="edit" />
      </ProtectedRoute>
    </Route>
    <Route path="/settings/bank-accounts/:recordId">
      <ProtectedRoute>
        <SettingsRecordPage resource="bank" mode="view" />
      </ProtectedRoute>
    </Route>
    <Route path="/settings/bank-accounts">
      <ProtectedRoute>
        <BankAccountsPage />
      </ProtectedRoute>
    </Route>
  </>
)
