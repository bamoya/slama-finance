import { Redirect, Route } from 'wouter'

import { ClientDetailPage } from '../../features/clients'
import { ClientFormPage } from '../../features/clients'
import { ClientsPage } from '../../features/clients'
import { DashboardPage } from '../../features/dashboard'
import { ChangePasswordPage } from '../../features/identity'
import { ProfilePage } from '../../features/identity'
import { RoleCreatePage } from '../../features/identity'
import { RolesPage } from '../../features/identity'
import { StaffDetailPage } from '../../features/identity'
import { StaffFormPage } from '../../features/identity'
import { StaffPage } from '../../features/identity'
import { NotificationRulePage, NotificationsPage } from '../../features/notifications'
import { ProductDetailPage } from '../../features/products'
import { ProductFormPage } from '../../features/products'
import { ProductsPage } from '../../features/products'
import { CategoriesPage, CategoryDetailPage, CategoryFormPage } from '../../features/products'
import { ReportScheduleFormPage } from '../../features/reports'
import { ReportSchedulesPage } from '../../features/reports'
import { LiveReportsPage, ReportsPage } from '../../features/reports'
import { ReportRunPage, ReportScheduleDetailPage } from '../../features/reports'
import { PaymentCreatePage, PaymentDetailPage, PaymentsPage } from '../../features/sales'
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
} from '../../features/sales'
import { BankAccountsPage } from '../../features/settings'
import { CompanySettingsPage } from '../../features/settings'
import { DocumentTemplatesPage } from '../../features/settings'
import { SettingsRecordPage } from '../../features/settings'
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
    <Route path="/">
      <Redirect to="/dashboard" />
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
