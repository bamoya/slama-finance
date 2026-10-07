import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Router, Switch } from 'wouter'
import { memoryLocation } from 'wouter/memory-location'

import type * as MediaApi from '../api/generated/media/media'
import type { Session } from '../api/generated/schemas/identity/auth.schemas'
import type {
  BankAccount,
  CompanySettings,
  DocumentTemplate,
} from '../api/generated/schemas/settings/settings.schemas'
import type * as GeneratedApi from '../api/generated/settings/settings'
import { apiRequest } from '../api/http'
import * as auth from '../features/identity/auth/api/auth-client'
import { CompanySettingsPage } from '../features/settings/company/pages/company-settings-page'
import { ApiError } from '../lib/api-error'
import { routeApiRequest } from '../test/api-transport'
import { ProtectedRoute } from './router/protected-route'
import { protectedRoutes } from './router/protected-routes'

const api = {
  getCompanySettings: vi.fn<typeof GeneratedApi.getCompanySettings>(),
  updateCompanySettings: vi.fn<typeof GeneratedApi.updateCompanySettings>(),
  listBankAccounts: vi.fn<typeof GeneratedApi.listBankAccounts>(),
  getBankAccount: vi.fn<typeof GeneratedApi.getBankAccount>(),
  createBankAccount: vi.fn<typeof GeneratedApi.createBankAccount>(),
  updateBankAccount: vi.fn<typeof GeneratedApi.updateBankAccount>(),
  archiveBankAccount: vi.fn<typeof GeneratedApi.archiveBankAccount>(),
  restoreBankAccount: vi.fn<typeof GeneratedApi.restoreBankAccount>(),
  deleteBankAccount: vi.fn<typeof GeneratedApi.deleteBankAccount>(),
  listDocumentTemplates: vi.fn<typeof GeneratedApi.listDocumentTemplates>(),
  getDocumentTemplate: vi.fn<typeof GeneratedApi.getDocumentTemplate>(),
  createDocumentTemplate: vi.fn<typeof GeneratedApi.createDocumentTemplate>(),
  updateDocumentTemplate: vi.fn<typeof GeneratedApi.updateDocumentTemplate>(),
  archiveDocumentTemplate: vi.fn<typeof GeneratedApi.archiveDocumentTemplate>(),
  deleteDocumentTemplate: vi.fn<typeof GeneratedApi.deleteDocumentTemplate>(),
  previewDocumentTemplate: vi.fn<typeof GeneratedApi.previewDocumentTemplate>(),
  uploadMedia: vi.fn<typeof MediaApi.uploadMedia>(),
}
vi.mock('../features/identity/auth/api/auth-client', () => ({
  getSession: vi.fn(),
  logout: vi.fn(),
}))
vi.mock('../api/http', () => ({ apiRequest: vi.fn() }))
const id = '11111111-1111-4111-8111-111111111111'
const stamp = '2026-09-27T00:00:00.000Z'
const meta = {
  version: 1,
  createdAt: stamp,
  updatedAt: stamp,
  createdByUserId: null,
  updatedByUserId: null,
}
const company: CompanySettings = {
  id: 1,
  legalName: null,
  tradeName: null,
  legalForm: null,
  shareCapital: null,
  addressLine1: null,
  addressLine2: null,
  city: null,
  postalCode: null,
  countryCode: 'MA',
  ice: null,
  taxIdentifier: null,
  registrationNumber: null,
  registrationCity: null,
  professionalTaxNumber: null,
  email: null,
  phone: null,
  logoAssetId: null,
  currency: 'MAD',
  locale: 'fr-MA',
  timezone: 'Africa/Casablanca',
  paymentDueDays: 15,
  estimateValidDays: 15,
  defaultTemplateId: null,
  ...meta,
}
const bank: BankAccount = {
  id,
  name: 'Main account',
  bankName: 'Bank',
  accountHolder: 'Company',
  rib: '001234567890123456789012',
  iban: null,
  currency: 'MAD',
  archivedAt: null,
  ...meta,
}
const template: DocumentTemplate = {
  id,
  name: 'Classic',
  layout: 'classic',
  density: 'standard',
  accentColor: '#ad7d1d',
  logoAssetId: null,
  signatureAssetId: null,
  showBankDetails: true,
  showSignature: false,
  showPaymentTerms: true,
  footerText: null,
  paymentTerms: null,
  archivedAt: null,
  ...meta,
}
const session: Session = {
  user: { id, email: 'admin@example.test', firstName: 'Admin', lastName: 'User', avatarUrl: null },
  purpose: 'full',
  permissionKeys: [
    'company_settings.read',
    'company_settings.update',
    'bank_accounts.read',
    'bank_accounts.create',
    'bank_accounts.update',
    'bank_accounts.update',
    'bank_accounts.update',
    'bank_accounts.delete',
    'templates.read',
    'templates.create',
    'templates.update',
    'templates.update',
    'templates.delete',
    'templates.read',
    'templates.update',
  ],
}
const caches: QueryClient[] = []
function setup(node: ReactNode, path = '/settings/company') {
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  caches.push(cache)
  render(
    <QueryClientProvider client={cache}>
      <Router hook={memoryLocation({ path }).hook}>{node}</Router>
    </QueryClientProvider>,
  )
}
const fill = fillField
beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(apiRequest).mockImplementation(routeApiRequest(api) as typeof apiRequest)
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  )
  vi.mocked(auth.getSession).mockResolvedValue(session)
  vi.mocked(api.getCompanySettings).mockResolvedValue(company)
  vi.mocked(api.listBankAccounts).mockResolvedValue([bank])
  vi.mocked(api.getBankAccount).mockResolvedValue(bank)
  vi.mocked(api.listDocumentTemplates).mockResolvedValue([template])
  vi.mocked(api.getDocumentTemplate).mockResolvedValue(template)
  api.previewDocumentTemplate.mockResolvedValue({ html: '<p>API preview</p>', pageCount: 1 })

  vi.stubGlobal(
    'URL',
    class extends URL {
      static override createObjectURL() {
        return 'blob:preview'
      }
      static override revokeObjectURL() {}
    },
  )
})
afterEach(() => caches.splice(0).forEach((cache) => cache.clear()))

const visit = (path: string) => setup(<Switch>{protectedRoutes.props.children}</Switch>, path)
describe('API-integrated company settings pages', () => {
  it('shows company values without disabled inputs and opens a dedicated edit page', async () => {
    visit('/settings/company')
    await screen.findByRole('link', { name: 'Edit company' })
    expect(screen.queryByLabelText('Legal company name')).not.toBeInTheDocument()
    expect(await screen.findByText('Company identity')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('link', { name: 'Edit company' }))
    expect(await screen.findByLabelText('Legal company name')).toBeEnabled()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Upload logo').closest('aside')).not.toBeNull()
    expect(screen.getByLabelText('Default currency').closest('aside')).not.toBeNull()
    expect(screen.getByLabelText('Legal company name').closest('aside')).toBeNull()
  })
  it('saves company details with a version and returns to readable details', async () => {
    const saved = { ...company, legalName: 'Slama', version: 2 }
    vi.mocked(api.updateCompanySettings).mockResolvedValue(saved)
    visit('/settings/company/edit')
    await screen.findByLabelText('Legal company name')
    fill('Legal company name', 'Slama')
    vi.mocked(api.getCompanySettings).mockResolvedValue(saved)
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(await screen.findByText('Slama')).toBeInTheDocument()
    expect(api.updateCompanySettings).toHaveBeenCalledWith(
      expect.objectContaining({ legalName: 'Slama', expectedVersion: 1, currency: 'MAD' }),
    )
    expect(screen.queryByRole('button', { name: 'Save changes' })).not.toBeInTheDocument()
  })
  it('preserves edits on conflict until explicit reload', async () => {
    vi.mocked(api.updateCompanySettings).mockRejectedValue(
      new ApiError(409, 'STALE_VERSION', 'This record changed.'),
    )
    visit('/settings/company/edit')
    await screen.findByLabelText('Legal company name')
    fill('Legal company name', 'Unsaved')
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    await screen.findByRole('alert')
    expect(screen.getByLabelText('Legal company name')).toHaveValue('Unsaved')
    vi.mocked(api.getCompanySettings).mockResolvedValue({
      ...company,
      legalName: 'Latest',
      version: 2,
    })
    fireEvent.click(screen.getByRole('button', { name: 'Discard edits and reload latest' }))
    await waitFor(() => expect(screen.getByLabelText('Legal company name')).toHaveValue('Latest'))
  })
  it('confirms discarding a draft on cancel and protects browser unload', async () => {
    visit('/settings/company/edit')
    await screen.findByLabelText('Legal company name')
    fill('Legal company name', 'Unsaved')
    const event = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
    fireEvent.click(screen.getByRole('link', { name: 'Cancel' }))
    expect(await screen.findByRole('dialog')).toHaveTextContent('Discard unsaved changes?')
    fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }))
    expect(screen.getByLabelText('Legal company name')).toHaveValue('Unsaved')
    fireEvent.click(screen.getByRole('link', { name: 'Cancel' }))
    fireEvent.click(screen.getByRole('button', { name: 'Discard changes' }))
    expect(await screen.findByRole('link', { name: 'Edit company' })).toBeInTheDocument()
    expect(api.updateCompanySettings).not.toHaveBeenCalled()
  })
  it('creates a bank account from its own page and archives from details with confirmation', async () => {
    vi.mocked(api.createBankAccount).mockResolvedValue(bank)
    vi.mocked(api.archiveBankAccount).mockResolvedValue({ ...bank, archivedAt: stamp, version: 2 })
    visit('/settings/bank-accounts')
    fireEvent.click(await screen.findByRole('link', { name: 'Add bank account' }))
    await screen.findByLabelText('Account label')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    fill('Account label', bank.name)
    fill('Bank name', bank.bankName)
    fill('Account holder', bank.accountHolder)
    fill('RIB', bank.rib!)
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    await screen.findByRole('link', { name: 'Edit bank account' })
    expect(api.createBankAccount).toHaveBeenCalledWith(
      expect.objectContaining({ rib: bank.rib, currency: 'MAD' }),
    )
    expect(screen.queryByLabelText('RIB')).not.toBeInTheDocument()
    fireEvent.pointerDown(screen.getByRole('button', { name: 'More' }), {
      button: 0,
      ctrlKey: false,
    })
    fireEvent.click(screen.getByRole('menuitem', { name: 'Archive' }))
    expect(api.archiveBankAccount).not.toHaveBeenCalled()
    vi.mocked(api.getBankAccount).mockResolvedValue({ ...bank, archivedAt: stamp, version: 2 })
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Confirm' }))
    await waitFor(() =>
      expect(api.archiveBankAccount).toHaveBeenCalledWith(id, { expectedVersion: 1 }),
    )
    expect(await screen.findByText('Archived')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Edit bank account' })).not.toBeInTheDocument()
  })
  it('loads a bank edit URL directly and submits the original version', async () => {
    const saved = { ...bank, name: 'Updated', version: 2 }
    vi.mocked(api.updateBankAccount).mockResolvedValue(saved)
    visit(`/settings/bank-accounts/${id}/edit`)
    await screen.findByLabelText('Account label')
    expect(api.getBankAccount).toHaveBeenCalledWith(id)
    fill('Account label', 'Updated')
    vi.mocked(api.getBankAccount).mockResolvedValue(saved)
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    await screen.findByRole('link', { name: 'Edit bank account' })
    expect(api.updateBankAccount).toHaveBeenCalledWith(
      id,
      expect.objectContaining({ name: 'Updated', expectedVersion: 1 }),
    )
  })
  it('edits templates and renders a sandboxed preview in the side column', async () => {
    vi.mocked(api.previewDocumentTemplate).mockResolvedValue({
      html: '<p>Sample only</p>',
      pageCount: 1,
    })
    vi.mocked(api.updateDocumentTemplate).mockResolvedValue({ ...template, version: 2 })
    visit('/settings/invoice-appearance')
    fireEvent.pointerDown(await screen.findByRole('button', { name: 'Actions for Classic' }), {
      button: 0,
      ctrlKey: false,
    })
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Edit' }))
    await screen.findByLabelText('Footer text')
    fill('Footer text', 'Thank you')
    const colorPicker = screen.getByLabelText('Accent color')
    expect(colorPicker).toHaveAttribute('type', 'color')
    expect(colorPicker).toHaveValue(template.accentColor)
    fireEvent.change(colorPicker, { target: { value: '#25634a' } })
    expect(screen.queryByRole('button', { name: 'Preview template' })).not.toBeInTheDocument()
    const preview = await screen.findByTitle('Document template preview')
    expect(preview).toHaveAttribute('sandbox', '')
    expect(preview).toHaveAttribute('srcdoc', '<p>Sample only</p>')
    expect(preview.closest('aside')).not.toBeNull()
    await waitFor(() =>
      expect(api.previewDocumentTemplate).toHaveBeenCalledWith(
        expect.objectContaining({ accentColor: '#25634a' }),
        { documentType: 'invoice', sampleSize: 'short' },
      ),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    await screen.findByRole('link', { name: 'Edit template' })
    expect(api.updateDocumentTemplate).toHaveBeenCalledWith(
      id,
      expect.objectContaining({
        footerText: 'Thank you',
        accentColor: '#25634a',
        expectedVersion: 1,
      }),
    )
  })
  it('creates a template and retains the explicit default-clearing archive warning', async () => {
    vi.mocked(api.createDocumentTemplate).mockResolvedValue(template)
    vi.mocked(api.archiveDocumentTemplate).mockResolvedValue({
      ...template,
      archivedAt: stamp,
      version: 2,
    })
    visit('/settings/invoice-appearance')
    fireEvent.click(await screen.findByRole('link', { name: 'Create template' }))
    await screen.findByLabelText('Template name')
    fill('Template name', 'Classic')
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    await screen.findByRole('link', { name: 'Edit template' })
    expect(api.createDocumentTemplate).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Classic', layout: 'classic', showSignature: false }),
    )
    fireEvent.pointerDown(screen.getByRole('button', { name: 'More' }), {
      button: 0,
      ctrlKey: false,
    })
    fireEvent.click(screen.getByRole('menuitem', { name: 'Archive' }))
    expect(screen.getByRole('dialog')).toHaveTextContent(
      'company default, that selection will be cleared',
    )
    expect(api.archiveDocumentTemplate).not.toHaveBeenCalled()
    vi.mocked(api.getDocumentTemplate).mockResolvedValue({
      ...template,
      archivedAt: stamp,
      version: 2,
    })
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    await waitFor(() =>
      expect(api.archiveDocumentTemplate).toHaveBeenCalledWith(id, { expectedVersion: 1 }),
    )
  })
  it('offers fixed layouts with a live document-type preview', async () => {
    visit(`/settings/invoice-appearance/${id}/edit`)
    await screen.findByLabelText('Template name')
    fireEvent.click(screen.getByRole('radio', { name: 'Compact' }))
    fireEvent.click(screen.getByRole('radio', { name: 'Delivery note' }))
    fireEvent.change(screen.getByLabelText('Footer text'), { target: { value: 'Thank you' } })
    await waitFor(() =>
      expect(api.previewDocumentTemplate).toHaveBeenCalledWith(
        expect.objectContaining({ layout: 'minimal', footerText: 'Thank you' }),
        { documentType: 'delivery', sampleSize: 'short' },
      ),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() =>
      expect(api.updateDocumentTemplate).toHaveBeenCalledWith(
        id,
        expect.objectContaining({ layout: 'minimal', footerText: 'Thank you' }),
      ),
    )
  })
  it('preserves the original layouts while saving a new theme with compact density', async () => {
    api.updateDocumentTemplate.mockResolvedValue({
      ...template,
      layout: 'atelier',
      density: 'compact',
      version: 2,
    })
    visit(`/settings/invoice-appearance/${id}/edit`)
    await screen.findByLabelText('Template name')
    for (const name of [
      'Classic',
      'Modern',
      'Compact',
      'Signature',
      'Atelier',
      'Ledger',
      'Essential',
    ])
      expect(screen.getByRole('radio', { name })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('radio', { name: 'Atelier' }))
    fireEvent.click(screen.getByRole('radio', { name: 'Compact density' }))
    fireEvent.click(screen.getByRole('radio', { name: 'Many rows (45)' }))
    await waitFor(() =>
      expect(api.previewDocumentTemplate).toHaveBeenCalledWith(
        expect.objectContaining({
          layout: 'atelier',
          density: 'compact',
          accentColor: template.accentColor,
        }),
        { documentType: 'invoice', sampleSize: 'many' },
      ),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() =>
      expect(api.updateDocumentTemplate).toHaveBeenCalledWith(
        id,
        expect.objectContaining({ layout: 'atelier', density: 'compact', expectedVersion: 1 }),
      ),
    )
  })
  it('duplicates a saved template as a new record without changing its source', async () => {
    api.createDocumentTemplate.mockResolvedValue({
      ...template,
      id: '22222222-2222-4222-8222-222222222222',
      name: 'Classic (copy)',
    })
    visit('/settings/invoice-appearance')
    fireEvent.pointerDown(await screen.findByRole('button', { name: 'Actions for Classic' }), {
      button: 0,
      ctrlKey: false,
    })
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Duplicate template' }))
    expect(await screen.findByLabelText('Template name')).toHaveValue('Classic (copy)')
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() =>
      expect(api.createDocumentTemplate).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Classic (copy)', layout: 'classic', density: 'standard' }),
      ),
    )
    expect(api.updateDocumentTemplate).not.toHaveBeenCalled()
  })

  it('filters the compact template list and loads a preview only on demand', async () => {
    api.listDocumentTemplates.mockResolvedValue([
      template,
      {
        ...template,
        id: '22222222-2222-4222-8222-222222222222',
        name: 'Wholesale',
        layout: 'atelier',
        density: 'compact',
      },
      {
        ...template,
        id: '33333333-3333-4333-8333-333333333333',
        name: 'Old design',
        archivedAt: stamp,
      },
    ])
    visit('/settings/invoice-appearance')
    expect(await screen.findByText('2 of 3 templates')).toBeInTheDocument()
    expect(api.previewDocumentTemplate).not.toHaveBeenCalled()
    fill('Search templates…', 'Wholesale')
    expect(screen.queryByRole('link', { name: 'Classic' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Wholesale' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
    fill('Density', 'compact')
    expect(screen.getByText('1 of 3 templates')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Preview Wholesale' }))
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    await waitFor(() =>
      expect(api.previewDocumentTemplate).toHaveBeenCalledWith(
        expect.objectContaining({ layout: 'atelier', density: 'compact' }),
        { documentType: 'invoice', sampleSize: 'short' },
      ),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Close preview' }))
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
    fill('Status', 'archived')
    expect(screen.getByRole('link', { name: 'Old design' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Classic' })).not.toBeInTheDocument()
  })

  it('renders the uploaded signature in the live preview only when enabled', async () => {
    api.getDocumentTemplate.mockResolvedValue({
      ...template,
      signatureAssetId: id,
      showSignature: true,
    })
    visit(`/settings/invoice-appearance/${id}/edit`)
    await screen.findByTitle('Document template preview')
    expect(api.previewDocumentTemplate).toHaveBeenCalledWith(
      expect.objectContaining({ signatureAssetId: id, showSignature: true }),
      { documentType: 'invoice', sampleSize: 'short' },
    )
    fireEvent.click(screen.getByRole('switch', { name: 'Show signature' }))
    await waitFor(() =>
      expect(api.previewDocumentTemplate).toHaveBeenLastCalledWith(
        expect.objectContaining({ showSignature: false }),
        { documentType: 'invoice', sampleSize: 'short' },
      ),
    )
  })
  it('offers payment receipts in the document template preview', async () => {
    visit(`/settings/invoice-appearance/${id}/edit`)
    await screen.findByLabelText('Template name')
    fireEvent.click(screen.getByRole('radio', { name: 'Payment receipt' }))
    await waitFor(() =>
      expect(api.previewDocumentTemplate).toHaveBeenCalledWith(
        expect.objectContaining({ layout: template.layout }),
        { documentType: 'payment_receipt', sampleSize: 'short' },
      ),
    )
  })

  it('uploads and previews logo and signature assets on the edit page', async () => {
    visit(`/settings/invoice-appearance/${id}/edit`)
    await screen.findByLabelText('Template name')
    for (const kind of ['logo', 'signature'] as const) {
      vi.mocked(api.uploadMedia).mockResolvedValue({
        id,
        originalFilename: 'image.png',
        purpose: kind === 'logo' ? 'company_logo' : 'company_signature',
        status: 'ready',
        uploadedBy: session.user.id,
        expiresAt: stamp,
        deletedAt: null,
        version: 2,
        createdAt: stamp,
        updatedAt: stamp,
        contentType: 'image/png',
        byteSize: 4,
      })
      fireEvent.change(screen.getByLabelText(`Upload ${kind}`), {
        target: { files: [new File(['data'], 'image.png', { type: 'image/png' })] },
      })
      expect(await screen.findByAltText(`Company ${kind}`)).toHaveAttribute('src', 'blob:preview')
      expect(api.uploadMedia).toHaveBeenCalledWith(
        expect.objectContaining({
          purpose: kind === 'logo' ? 'company_logo' : 'company_signature',
          contentType: 'image/png',
        }),
        expect.anything(),
      )
    }
  })
  it('rejects oversized uploads before requesting the API and re-enables saving', async () => {
    visit(`/settings/invoice-appearance/${id}/edit`)
    await screen.findByLabelText('Template name')
    fireEvent.change(screen.getByLabelText('Upload logo'), {
      target: {
        files: [
          new File([new Uint8Array(2 * 1024 * 1024 + 1)], 'large.png', { type: 'image/png' }),
        ],
      },
    })
    expect(await screen.findByText('Images must be at most 2 MiB.')).toBeInTheDocument()
    expect(api.uploadMedia).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeEnabled()
  })
  it('shows upload failures without replacing the form selection', async () => {
    vi.mocked(api.uploadMedia).mockRejectedValue(
      new ApiError(503, 'STORAGE_UNAVAILABLE', 'Storage unavailable.'),
    )
    visit(`/settings/invoice-appearance/${id}/edit`)
    await screen.findByLabelText('Template name')
    fireEvent.change(screen.getByLabelText('Upload logo'), {
      target: { files: [new File(['data'], 'image.png', { type: 'image/png' })] },
    })
    expect(await screen.findByText('Storage unavailable.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Remove logo' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeEnabled()
  })
  it('keeps company view-only access readable without edit controls', async () => {
    vi.mocked(auth.getSession).mockResolvedValue({
      ...session,
      permissionKeys: ['company_settings.read'],
    })
    visit('/settings/company')
    await screen.findByText('Company identity')
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Edit company' })).not.toBeInTheDocument()
  })
  it.each([
    '/settings/company/edit',
    '/settings/bank-accounts/new',
    `/settings/bank-accounts/${id}/edit`,
    '/settings/invoice-appearance/new',
    `/settings/invoice-appearance/${id}/edit`,
  ])('denies direct write route %s to read-only users', async (path) => {
    vi.mocked(auth.getSession).mockResolvedValue({
      ...session,
      permissionKeys: ['company_settings.read', 'bank_accounts.read', 'templates.read'],
    })
    visit(path)
    expect(await screen.findByRole('alert')).toHaveTextContent('You do not have permission')
    expect(api.getCompanySettings).not.toHaveBeenCalled()
    expect(api.getBankAccount).not.toHaveBeenCalled()
    expect(api.getDocumentTemplate).not.toHaveBeenCalled()
  })
  it('keeps archived templates read-only even on their edit URL', async () => {
    vi.mocked(api.getDocumentTemplate).mockResolvedValue({ ...template, archivedAt: stamp })
    visit(`/settings/invoice-appearance/${id}/edit`)
    await screen.findByText('Archived')
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save changes' })).not.toBeInTheDocument()
  })
  it('shows a missing record error instead of an empty editor', async () => {
    vi.mocked(api.getBankAccount).mockRejectedValue(
      new ApiError(404, 'NOT_FOUND', 'Bank account not found.'),
    )
    visit(`/settings/bank-accounts/${id}/edit`)
    expect(await screen.findByText('Record not found')).toBeInTheDocument()
    expect(screen.queryByLabelText('RIB')).not.toBeInTheDocument()
  })
  it('denies the settings page without view permission', async () => {
    vi.mocked(auth.getSession).mockResolvedValue({ ...session, permissionKeys: [] })
    setup(
      <ProtectedRoute>
        <CompanySettingsPage />
      </ProtectedRoute>,
    )
    expect(await screen.findByRole('alert')).toHaveTextContent('You do not have permission')
    expect(api.getCompanySettings).not.toHaveBeenCalled()
  })
  it('combines bank filters and preserves them when visiting details and returning', async () => {
    const other = {
      ...bank,
      id: '22222222-2222-4222-8222-222222222222',
      name: 'Euro reserve',
      bankName: 'Other bank',
      currency: 'EUR' as const,
    }
    const archived = {
      ...bank,
      id: '33333333-3333-4333-8333-333333333333',
      name: 'Old account',
      archivedAt: stamp,
    }
    vi.mocked(api.listBankAccounts).mockResolvedValue([bank, other, archived])
    visit('/settings/bank-accounts')
    expect(await screen.findByText('2 of 3 accounts')).toBeInTheDocument()
    const tableContainer = screen.getByRole('region', { name: 'Bank accounts table' })
    expect(within(tableContainer).getByLabelText('Currency')).toBeInTheDocument()
    expect(within(tableContainer).getByRole('table')).toBeInTheDocument()
    fill('Currency', 'EUR')
    expect(screen.getByText('1 of 3 accounts')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Euro reserve' })).toBeInTheDocument()
    fill('Bank', bank.bankName)
    expect(screen.getByText('No matching accounts')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
    fill('Search bank accounts', bank.rib!.slice(0, 6) + ' ' + bank.rib!.slice(6))
    fill('Currency', 'MAD')
    fill('Bank', bank.bankName)
    const view = screen.getByRole('link', { name: 'View' })
    expect(view.getAttribute('href')).toContain('currency=MAD')
    fireEvent.click(view)
    fireEvent.click(await screen.findByRole('link', { name: /Back to bank accounts/ }))
    expect(await screen.findByLabelText('Currency')).toHaveTextContent('MAD')
    expect(screen.getByLabelText('Bank')).toHaveTextContent(bank.bankName)
    expect(screen.getByLabelText('Search bank accounts')).toHaveValue(
      bank.rib!.slice(0, 6) + ' ' + bank.rib!.slice(6),
    )
    fill('Status', 'archived')
    expect(screen.getByRole('link', { name: 'Old account' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: bank.name })).not.toBeInTheDocument()
    fill('Status', 'all')
    expect(screen.getByText('2 of 3 accounts')).toBeInTheDocument()
  })
  it('restores a bank account from the archived list after confirmation', async () => {
    const archived = { ...bank, archivedAt: stamp, version: 2 }
    vi.mocked(api.listBankAccounts).mockResolvedValue([archived])
    vi.mocked(api.restoreBankAccount).mockResolvedValue({ ...bank, version: 3 })
    visit('/settings/bank-accounts?status=archived')
    fireEvent.click(await screen.findByRole('button', { name: 'Restore account' }))
    expect(api.restoreBankAccount).not.toHaveBeenCalled()
    vi.mocked(api.listBankAccounts).mockResolvedValue([{ ...bank, version: 3 }])
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    await waitFor(() =>
      expect(api.restoreBankAccount).toHaveBeenCalledWith(id, { expectedVersion: 2 }),
    )
    expect(await screen.findByText('No matching accounts')).toBeInTheDocument()
    fill('Status', 'active')
    expect(await screen.findByRole('link', { name: bank.name })).toBeInTheDocument()
  })
  it.each(['bank', 'template'] as const)(
    'deletes an unreferenced %s only after confirmation',
    async (resource) => {
      vi.mocked(api.deleteBankAccount).mockResolvedValue(undefined)
      vi.mocked(api.deleteDocumentTemplate).mockResolvedValue(undefined)
      const base = resource === 'bank' ? '/settings/bank-accounts' : '/settings/invoice-appearance'
      visit(`${base}/${id}`)
      fireEvent.pointerDown(await screen.findByRole('button', { name: 'More' }), {
        button: 0,
        ctrlKey: false,
      })
      fireEvent.click(await screen.findByRole('menuitem', { name: 'Delete' }))
      const operation = resource === 'bank' ? api.deleteBankAccount : api.deleteDocumentTemplate
      expect(operation).not.toHaveBeenCalled()
      expect(screen.getByRole('dialog')).toHaveTextContent('only if no records reference it')
      vi.mocked(api.listBankAccounts).mockResolvedValue([])
      vi.mocked(api.listDocumentTemplates).mockResolvedValue([])
      fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
      await waitFor(() => expect(operation).toHaveBeenCalledWith(id, { expectedVersion: 1 }))
      expect(
        await screen.findByRole('link', {
          name: resource === 'bank' ? 'Add bank account' : 'Create template',
        }),
      ).toBeInTheDocument()
    },
  )
  it('retains the record and displays the API reason when deletion is blocked', async () => {
    vi.mocked(api.deleteDocumentTemplate).mockRejectedValue(
      new ApiError(409, 'RECORD_IN_USE', 'This template is attached. Archive it instead.'),
    )
    visit(`/settings/invoice-appearance/${id}`)
    fireEvent.pointerDown(await screen.findByRole('button', { name: 'More' }), {
      button: 0,
      ctrlKey: false,
    })
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Delete' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('This template is attached.')
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.getByRole('link', { name: 'Edit template' })).toBeInTheDocument()
  })
  it('allows archive but not delete or create for an update-only bank role', async () => {
    vi.mocked(auth.getSession).mockResolvedValue({
      ...session,
      permissionKeys: ['bank_accounts.read', 'bank_accounts.update'],
    })
    visit('/settings/bank-accounts')
    await screen.findByRole('link', { name: 'Edit' })
    expect(screen.queryByRole('link', { name: 'Add bank account' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Archive' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument()
  })
})
import { fillField } from '../test/fill-field'
