import { ArrowLeft, Banknote, Check, Landmark, ReceiptText } from 'lucide-react'
import { useState } from 'react'
import { Link, useLocation } from 'wouter'

import { FormActionBar } from '../../../components/management/form-action-bar'
import { PageHeader } from '../../../components/management/page-header'
import { Button, buttonVariants } from '../../../components/ui/button'
import { Combobox } from '../../../components/ui/combobox'
import { Input } from '../../../components/ui/input'
import { Label } from '../../../components/ui/label'
import { Textarea } from '../../../components/ui/textarea'
import { translate, useUiLanguage } from '../../../lib/i18n'
import { invoices } from '../../documents'
import { formatMoney } from '../../products'
import type { PaymentMethod } from '../data/payments'

const methods: { name: PaymentMethod; icon: typeof Banknote }[] = [
  { name: 'Cash', icon: Banknote },
  { name: 'Bank transfer', icon: Landmark },
  { name: 'Cheque', icon: ReceiptText },
]

export function PaymentFormPage() {
  useUiLanguage()

  const [, navigate] = useLocation()
  const [method, setMethod] = useState<PaymentMethod>('Bank transfer')
  const [invoiceId, setInvoiceId] = useState('inv-0048')
  const [bankAccount, setBankAccount] = useState('banque-populaire')
  const [amount, setAmount] = useState(3000)
  const invoice = invoices.find((record) => record.id === invoiceId) ?? invoices[0]!
  const invoiceTotal = invoice.total
  const alreadyPaid = invoice.paidAmount ?? 0
  const remaining = Math.max(0, invoiceTotal - alreadyPaid - amount)

  return (
    <div className="mx-auto max-w-[1500px] p-page">
      <Link
        href="/payments"
        className="mb-6 inline-flex items-center gap-2 text-sm font-semibold text-[var(--muted)]"
      >
        <ArrowLeft size={17} />
        {translate('Back to payments')}
      </Link>
      <form
        id="payment-form-page"
        className="grid gap-section"
        onSubmit={(event) => {
          event.preventDefault()
          navigate('/payments')
        }}
      >
        <PageHeader
          eyebrow={translate('Sales / Payments')}
          title={translate('Record an installment')}
          description={translate(
            'Register a full or partial payment and keep the remaining invoice balance accurate.',
          )}
        />
        <div className="grid gap-section xl:grid-cols-[minmax(0,1fr)_380px]">
          <section className="grid gap-section rounded-[24px] border border-[var(--border)] bg-[var(--surface)] p-surface md:p-panel">
            <Field label={translate('Invoice')}>
              <Combobox
                value={invoiceId}
                onValueChange={(value) => {
                  setInvoiceId(value)
                  const selected = invoices.find((record) => record.id === value)
                  if (selected)
                    setAmount((current) =>
                      Math.min(current, selected.total - (selected.paidAmount ?? 0)),
                    )
                }}
                options={invoices
                  .filter(
                    (record) =>
                      record.status !== translate('Draft') &&
                      record.total > (record.paidAmount ?? 0),
                  )
                  .map((record) => ({
                    value: record.id,
                    label: `${record.number} · ${record.client} · ${formatMoney(record.total - (record.paidAmount ?? 0))} remaining`,
                    keywords: [record.number, record.client],
                  }))}
                placeholder={translate('Select invoice')}
                aria-label={translate('Invoice')}
              />
            </Field>
            <div className="grid gap-content md:grid-cols-2">
              <Field label={translate('Amount received (MAD)')}>
                <Input
                  type="number"
                  min="1"
                  max={invoiceTotal - alreadyPaid}
                  value={amount}
                  onChange={(event) => setAmount(Number(event.target.value))}
                  required
                />
              </Field>
              <Field label={translate('Payment date')}>
                <Input type="date" defaultValue="2026-09-22" required />
              </Field>
            </div>
            <div>
              <Label>{translate('Payment method')}</Label>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                {methods.map(({ name, icon: Icon }) => (
                  <button
                    key={name}
                    type="button"
                    onClick={() => setMethod(name)}
                    className={`relative flex items-center gap-3 rounded-[16px] border p-4 text-left text-sm font-semibold ${method === name ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]' : 'border-[var(--border)]'}`}
                  >
                    <Icon size={19} />
                    {name}
                    {method === name && <Check className="ml-auto" size={16} />}
                  </button>
                ))}
              </div>
            </div>
            {method === translate('Bank transfer') && (
              <div className="grid gap-content md:grid-cols-2">
                <Field label={translate('Transfer reference')}>
                  <Input placeholder={translate('e.g. VIR-0922-ATLAS')} required />
                </Field>
                <Field label={translate('Bank account')}>
                  <Combobox
                    value={bankAccount}
                    onValueChange={setBankAccount}
                    options={[
                      {
                        value: 'banque-populaire',
                        label: translate('Banque Populaire · ••• 000'),
                        keywords: ['Banque Populaire', '000'],
                      },
                    ]}
                    placeholder={translate('Select bank account')}
                    aria-label={translate('Bank account')}
                  />
                </Field>
              </div>
            )}
            {method === translate('Cheque') && (
              <div className="grid gap-content md:grid-cols-3">
                <Field label={translate('Cheque number')}>
                  <Input placeholder={translate('Cheque number')} required />
                </Field>
                <Field label={translate('Bank')}>
                  <Input placeholder={translate('Issuing bank')} required />
                </Field>
                <Field label={translate('Deposit date')}>
                  <Input type="date" />
                </Field>
              </div>
            )}
            {method === translate('Cash') && (
              <Field label={translate('Receipt reference')}>
                <Input placeholder={translate('Generated automatically if empty')} />
              </Field>
            )}
            <Field label={translate('Internal note')}>
              <Textarea rows={3} placeholder={translate('Optional note about this payment')} />
            </Field>
          </section>
          <aside className="h-fit rounded-[24px] border border-[var(--border)] bg-[var(--surface)] p-panel">
            <h3 className="font-bold">{translate('Invoice balance')}</h3>
            <p className="mt-1 text-sm text-[var(--muted)]">
              {invoice.number} · {invoice.client}
            </p>
            <div className="mt-6 grid gap-3">
              <Amount label={translate('Invoice total')} value={invoiceTotal} />
              <Amount label={translate('Already paid')} value={alreadyPaid} />
              <Amount label={translate('This installment')} value={amount} accent />
              <div className="border-t border-[var(--border)] pt-3">
                <Amount label={translate('Remaining after payment')} value={remaining} strong />
              </div>
            </div>
            <div className="mt-5 h-2 overflow-hidden rounded-full bg-[var(--border)]">
              <div
                className="h-full rounded-full bg-emerald-500"
                style={{
                  width: `${Math.min(100, ((alreadyPaid + amount) / invoiceTotal) * 100)}%`,
                }}
              />
            </div>
            <p className="mt-2 text-right text-xs text-[var(--muted)]">
              {Math.round(((alreadyPaid + amount) / invoiceTotal) * 100)}
              {translate('% paid')}
            </p>
          </aside>
        </div>
        <FormActionBar>
          <Link href="/payments" className={buttonVariants({ variant: 'outline' })}>
            {translate('Cancel')}
          </Link>
          <Button type="submit" form="payment-form-page">
            {translate('Record payment')}
          </Button>
        </FormActionBar>
      </form>
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
function Amount({
  label,
  value,
  accent,
  strong,
}: {
  label: string
  value: number
  accent?: boolean
  strong?: boolean
}) {
  useUiLanguage()

  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-[var(--muted)]">{label}</span>
      <strong
        className={`${strong ? 'text-xl' : 'text-sm'} ${accent ? 'text-[var(--accent)]' : ''}`}
      >
        {formatMoney(value)}
      </strong>
    </div>
  )
}
