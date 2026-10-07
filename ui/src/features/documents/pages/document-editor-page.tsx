import {
  ArrowLeft,
  CalendarDays,
  Eye,
  FileDown,
  ImagePlus,
  Pencil,
  Plus,
  Save,
  Trash2,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useLocation, useParams } from 'wouter'

import { FormActionBar } from '../../../components/management/form-action-bar'
import { MoreAction, MoreActions } from '../../../components/management/more-actions'
import { Button, buttonVariants } from '../../../components/ui/button'
import { Combobox } from '../../../components/ui/combobox'
import { Input } from '../../../components/ui/input'
import { Label } from '../../../components/ui/label'
import { Select, SelectOption } from '../../../components/ui/select'
import { Textarea } from '../../../components/ui/textarea'
import { translate, useUiLanguage } from '../../../lib/i18n'
import { clients } from '../../clients'
import { formatMoney, products } from '../../products'

type Line = { id: number; productName: string; quantity: number; price: number; vat: number }
export function DocumentEditorPage({
  kind,
  mode = 'edit',
}: {
  kind: 'Invoice' | 'Estimate'
  mode?: 'edit' | 'view'
}) {
  useUiLanguage()

  const { documentId } = useParams<{ documentId?: string }>()
  const [, navigate] = useLocation()
  const base = kind === 'Invoice' ? 'invoices' : 'estimates'
  const readOnly = mode === 'view'
  const [accent, setAccent] = useState('#b98718')
  const [clientId, setClientId] = useState(clients[0]?.id ?? '')
  const selectedClient = clients.find((client) => client.id === clientId) ?? clients[0]
  const [lines, setLines] = useState<Line[]>([
    { id: 1, productName: 'Premium wheat · 100 g', quantity: 12, price: 18, vat: 0 },
    { id: 2, productName: 'Premium wheat · 500 g', quantity: 4, price: 75, vat: 0 },
  ])
  const subtotal = useMemo(
    () => lines.reduce((sum, line) => sum + line.quantity * line.price, 0),
    [lines],
  )
  const tax = useMemo(
    () => lines.reduce((sum, line) => sum + (line.quantity * line.price * line.vat) / 100, 0),
    [lines],
  )
  const number =
    documentId?.toUpperCase().replace('-', '-') ?? (kind === 'Invoice' ? 'INV-0050' : 'EST-0031')
  const update = (id: number, key: keyof Line, value: string) =>
    setLines((current) =>
      current.map((line) =>
        line.id === id ? { ...line, [key]: key === 'productName' ? value : Number(value) } : line,
      ),
    )
  const selectProduct = (id: number, value: string) => {
    const product = products.find((item) => item.id === value)
    if (!product) return
    setLines((current) =>
      current.map((line) =>
        line.id === id ? { ...line, productName: product.name, price: product.price } : line,
      ),
    )
  }
  return (
    <div className="mx-auto grid max-w-[1500px] gap-content p-page">
      <header className="flex flex-col gap-4 rounded-[24px] border border-[var(--border)] bg-[var(--surface)] p-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <Link
            href={`/${base}`}
            className={buttonVariants({ variant: 'outline', size: 'icon-md' })}
          >
            <ArrowLeft size={18} />
          </Link>
          <div>
            <div className="flex items-center gap-2 text-xs text-[var(--muted)]">
              <span>{translate('Sales')}</span>
              <span>/</span>
              <span>
                {kind}
                {translate('s')}
              </span>
              <span>/</span>
              <span className="text-[var(--accent)]">
                {readOnly ? translate('Details') : translate('Editor')}
              </span>
            </div>
            <h2 className="mt-1 text-xl font-bold">
              {readOnly
                ? number
                : `${documentId ? translate('Edit') : translate('Create')} ${kind.toLowerCase()}`}
            </h2>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <MoreActions>
            <MoreAction label={translate('Preview')} icon={<Eye size={16} />} disabled />
            {readOnly && kind === translate('Estimate') && (
              <MoreAction
                label={translate('Convert to invoice')}
                href={`/estimates/${documentId}/convert`}
              />
            )}
          </MoreActions>
          {readOnly ? (
            <Link href={`/${base}/${documentId}/edit`} className={buttonVariants({})}>
              <Pencil size={16} aria-hidden="true" />
              {translate('Edit document')}
            </Link>
          ) : null}
        </div>
      </header>
      <div className="grid gap-content xl:grid-cols-[minmax(0,1fr)_330px]">
        <section className="grid gap-section rounded-[28px] border border-[var(--border)] bg-[var(--surface)] p-surface md:p-panel shadow-sm">
          <div className="flex flex-col gap-content lg:flex-row lg:items-start">
            <div className="grid flex-1 gap-content">
              <Field label={translate('{{value0}} number', { value0: kind })}>
                <Input defaultValue={number} disabled={readOnly} />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={translate('Issue date')}>
                  <DateField value="22 September 2026" />
                </Field>
                <Field
                  label={
                    kind === translate('Invoice') ? translate('Due date') : translate('Valid until')
                  }
                >
                  <DateField value="07 October 2026" />
                </Field>
              </div>
            </div>
            <button
              disabled={readOnly}
              className="grid h-40 w-full place-items-center rounded-[24px] border-2 border-dashed border-[var(--border)] bg-[var(--surface-muted)] text-center text-[var(--accent)] lg:w-52"
            >
              <span>
                <ImagePlus className="mx-auto mb-2" />
                <strong className="text-sm">{translate('Company logo')}</strong>
                <small className="mt-1 block text-[var(--muted)]">
                  {translate('Slama Finance')}
                </small>
              </span>
            </button>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <Address
              title={translate('Bill from')}
              name="Slama Finance SARL"
              detail={'15 Avenue Hassan II\nCasablanca, Morocco\nICE 001234567890123'}
            />
            <div className="rounded-[20px] bg-[var(--surface-muted)] p-5">
              <Label>{translate('Bill to')}</Label>
              <Combobox
                aria-label={translate('Bill to')}
                disabled={readOnly}
                className="mt-3"
                value={clientId}
                onValueChange={setClientId}
                options={clients.map((client) => ({
                  value: client.id,
                  label: client.name,
                  keywords: [client.ice, client.city],
                }))}
                placeholder={translate('Select client')}
              />
              <p className="mt-3 whitespace-pre-line text-sm leading-6 text-[var(--muted)]">
                {selectedClient?.contact}
                {'\n'}
                {selectedClient?.email}
                {'\n'}
                {translate('ICE')} {selectedClient?.ice}
              </p>
            </div>
          </div>
          <div className="overflow-hidden rounded-[22px] border border-[var(--border)]">
            <div className="grid grid-cols-[minmax(220px,1fr)_90px_130px_100px_130px] gap-3 bg-[#17191d] px-4 py-3 text-xs font-semibold text-white">
              <span>{translate('Product')}</span>
              <span>{translate('Qty')}</span>
              <span>{translate('Price')}</span>
              <span>{translate('VAT')}</span>
              <span>{translate('Total')}</span>
            </div>
            <div className="divide-y divide-[var(--border)]">
              {lines.map((line) => (
                <div
                  key={line.id}
                  className="grid min-w-[720px] grid-cols-[minmax(220px,1fr)_90px_130px_100px_130px] items-center gap-3 p-3"
                >
                  <Combobox
                    disabled={readOnly}
                    value={
                      products.find((product) => product.name === line.productName)?.id ??
                      line.productName
                    }
                    selectedLabel={line.productName}
                    onValueChange={(value) => selectProduct(line.id, value)}
                    options={products
                      .filter(
                        (product) =>
                          product.status === translate('Active') ||
                          product.name === line.productName,
                      )
                      .map((product) => ({
                        value: product.id,
                        label: product.name,
                        keywords: [product.reference],
                      }))}
                    placeholder={translate('Search product or reference')}
                    aria-label={translate('Product')}
                  />
                  <Input
                    disabled={readOnly}
                    value={line.quantity}
                    onChange={(e) => update(line.id, 'quantity', e.target.value)}
                    type="number"
                  />
                  <Input
                    disabled={readOnly}
                    value={line.price}
                    onChange={(e) => update(line.id, 'price', e.target.value)}
                    type="number"
                  />
                  <Select
                    aria-label={translate('VAT for line {{value0}}', { value0: line.id })}
                    disabled={readOnly}
                    value={line.vat}
                    onValueChange={(value) => update(line.id, 'vat', value)}
                  >
                    <SelectOption value="0">{translate('No VAT')}</SelectOption>
                    <SelectOption value="20">20%</SelectOption>
                    <SelectOption value="14">14%</SelectOption>
                    <SelectOption value="10">10%</SelectOption>
                  </Select>
                  <div className="flex items-center justify-between">
                    <strong className="text-sm">{formatMoney(line.quantity * line.price)}</strong>
                    {!readOnly && (
                      <Button
                        type="button"
                        variant="destructive"
                        aria-label={translate('Remove line item')}
                        onClick={() =>
                          setLines((current) => current.filter((item) => item.id !== line.id))
                        }
                        size="icon"
                      >
                        <Trash2 size={16} />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
            {!readOnly && (
              <Button
                onClick={() =>
                  setLines((current) => [
                    ...current,
                    { id: Date.now(), productName: '', quantity: 1, price: 0, vat: 0 },
                  ])
                }
                variant="outline"
                className="w-full"
              >
                <Plus size={16} />
                {translate('Add line item')}
              </Button>
            )}
          </div>
          <div className="grid gap-content md:grid-cols-[1fr_340px]">
            <Field label={translate('Notes & payment terms')}>
              <Textarea
                disabled={readOnly}
                rows={5}
                defaultValue="Thank you for your business. Payment is due within 15 days."
              />
            </Field>
            <div className="rounded-[20px] bg-[var(--surface-muted)] p-5">
              <Total label={translate('Subtotal')} value={formatMoney(subtotal)} />
              {tax > 0 && <Total label={translate('VAT')} value={formatMoney(tax)} />}
              <div className="my-4 border-t border-[var(--border)]" />
              <Total label={translate('Total')} value={formatMoney(subtotal + tax)} strong />
            </div>
          </div>
        </section>
        <aside className="grid content-start gap-4 rounded-[28px] border border-[var(--border)] bg-[var(--surface)] p-5">
          <h3 className="text-lg font-bold">{translate('Document settings')}</h3>
          <Field label={translate('Language')}>
            <Select disabled={readOnly}>
              <SelectOption>{translate('French')}</SelectOption>
              <SelectOption>{translate('Arabic')}</SelectOption>
              <SelectOption>{translate('English')}</SelectOption>
            </Select>
          </Field>
          <Field label={translate('Currency')}>
            <Select disabled={readOnly}>
              <SelectOption>{translate('MAD · Moroccan dirham')}</SelectOption>
              <SelectOption>{translate('EUR · Euro')}</SelectOption>
            </Select>
          </Field>
          <div>
            <Label>{translate('Accent color')}</Label>
            <div className="mt-3 flex gap-2">
              {['#b98718', '#ef6b62', '#4285f4', '#25a979', '#7950f2'].map((color) => (
                <button
                  disabled={readOnly}
                  key={color}
                  onClick={() => setAccent(color)}
                  style={{ background: color }}
                  className={`h-8 w-8 rounded-full ${accent === color ? 'ring-2 ring-offset-2 ring-[var(--text)]' : ''}`}
                />
              ))}
            </div>
          </div>
          <div>
            <Label>{translate('Template')}</Label>
            <div className="mt-3 rounded-[20px] border-2 p-3" style={{ borderColor: accent }}>
              <div className="aspect-[.75] rounded-[12px] bg-[var(--surface-muted)] p-3">
                <div className="h-8 w-8 rounded-lg" style={{ background: accent }} />
                <div className="mt-4 h-2 w-3/4 rounded bg-[var(--border)]" />
                <div className="mt-2 h-2 w-1/2 rounded bg-[var(--border)]" />
                <div className="mt-8 h-10 rounded" style={{ background: accent }} />
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-16 rounded bg-[var(--border)]" />
                  ))}
                </div>
              </div>
            </div>
          </div>
          <Button variant="outline">{translate('Change template')}</Button>
        </aside>
      </div>
      {readOnly && kind === translate('Invoice') && (
        <section className="overflow-hidden rounded-[24px] border border-[var(--border)] bg-[var(--surface)]">
          <header className="flex flex-col gap-3 border-b border-[var(--border)] p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="font-bold">{translate('Payments & installments')}</h3>
              <p className="mt-1 text-sm text-[var(--muted)]">
                {translate('5,000 MAD paid · 5,000 MAD remaining')}
              </p>
            </div>
            <Link href="/payments/new" className={buttonVariants({ size: 'md' })}>
              {translate('Record installment')}
            </Link>
          </header>
          <div className="grid gap-3 p-5 md:grid-cols-2">
            <PaymentRow
              date="21 Sep 2026"
              method="Bank transfer"
              reference="VIR-0921-ATLAS"
              amount="3,000 MAD"
              status="Received"
            />
            <PaymentRow
              date="18 Sep 2026"
              method="Cheque"
              reference="CHQ-448921"
              amount="2,000 MAD"
              status="Pending deposit"
            />
          </div>
        </section>
      )}
      {!readOnly && (
        <FormActionBar>
          <Link href={`/${base}`} className={buttonVariants({ variant: 'outline' })}>
            {translate('Cancel')}
          </Link>
          <Button variant="outline" disabled>
            <Save size={17} />
            {translate('Save draft')}
          </Button>
          <Button onClick={() => navigate(`/${base}`)}>
            <FileDown size={17} />
            {kind === translate('Invoice')
              ? translate('Finalize invoice')
              : translate('Save estimate')}
          </Button>
        </FormActionBar>
      )}
    </div>
  )
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  useUiLanguage()

  return (
    <label className="grid gap-2">
      <Label>{label}</Label>
      {children}
    </label>
  )
}
function DateField({ value }: { value: string }) {
  useUiLanguage()

  return (
    <div className="flex h-12 items-center gap-3 rounded-[14px] border border-[var(--border)] bg-[var(--surface-muted)] px-4 text-sm">
      <CalendarDays size={17} className="text-[var(--muted)]" />
      {value}
    </div>
  )
}
function Address({ title, name, detail }: { title: string; name: string; detail: string }) {
  useUiLanguage()

  return (
    <div className="rounded-[20px] bg-[var(--surface-muted)] p-5">
      <Label>{title}</Label>
      <strong className="mt-3 block">{name}</strong>
      <p className="mt-2 whitespace-pre-line text-sm leading-6 text-[var(--muted)]">{detail}</p>
    </div>
  )
}
function Total({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  useUiLanguage()

  return (
    <div className="flex items-center justify-between py-2">
      <span className="text-sm text-[var(--muted)]">{label}</span>
      <span className={strong ? 'text-xl font-bold' : 'text-sm font-semibold'}>{value}</span>
    </div>
  )
}
function PaymentRow({
  date,
  method,
  reference,
  amount,
  status,
}: {
  date: string
  method: string
  reference: string
  amount: string
  status: string
}) {
  useUiLanguage()

  return (
    <article className="flex items-center justify-between gap-4 rounded-[16px] bg-[var(--surface-muted)] p-4">
      <div>
        <strong className="text-sm">{method}</strong>
        <p className="mt-1 text-xs text-[var(--muted)]">
          {date} · {reference} · {status}
        </p>
      </div>
      <strong className="whitespace-nowrap text-sm text-[var(--accent)]">{amount}</strong>
    </article>
  )
}
