import { useQueryClient } from '@tanstack/react-query'
import { type FormEvent, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useLocation, useSearchParams } from 'wouter'
import { z } from 'zod'

import { PaymentInputSchema } from '../../../../api/generated/schemas/sales/payments.schemas'
import { FormActionBar } from '../../../../components/management/form-action-bar'
import { FormError } from '../../../../components/management/form-error'
import { PageHeader } from '../../../../components/management/page-header'
import { RequestState } from '../../../../components/management/request-state'
import { Button, buttonVariants } from '../../../../components/ui/button'
import { useUiLanguage } from '../../../../lib/i18n'
import { useAuthorization } from '../../../identity'
import { useBankAccounts } from '../../../settings'
import { useInvoice, useInvoices } from '../../invoices/queries'
import { PaymentFields, type PaymentMethod, type PaymentState } from '../components/payment-fields'
import { refreshPayments, usePaymentActions } from '../queries'

const cents = (value: string) => {
  const [whole = '0', fraction = ''] = value.split('.')
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'))
}
const companyToday = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Casablanca',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())

export function PaymentCreatePage() {
  useUiLanguage()

  const { t } = useTranslation('sales')
  const [params] = useSearchParams()
  const [, navigate] = useLocation()
  const cache = useQueryClient()
  const { can } = useAuthorization()
  const actions = usePaymentActions()
  const operationId = useRef(crypto.randomUUID())
  const [invoiceId, setInvoiceId] = useState(params.get('invoiceId') ?? '')
  const [invoiceSearch, setInvoiceSearch] = useState('')
  const [amount, setAmount] = useState('')
  const [paymentDate, setPaymentDate] = useState(companyToday)
  const [method, setMethod] = useState<PaymentMethod>('cash')
  const [status, setStatus] = useState<PaymentState>('confirmed')
  const [collectedOn, setCollectedOn] = useState(companyToday)
  const [bankAccountId, setBankAccountId] = useState('')
  const [reference, setReference] = useState('')
  const [chequeBank, setChequeBank] = useState('')
  const [chequeNumber, setChequeNumber] = useState('')
  const [validation, setValidation] = useState('')
  const [error, setError] = useState<unknown>()
  const [busy, setBusy] = useState(false)
  const clientId = params.get('clientId') ?? undefined
  const invoices = useInvoices(
    { search: invoiceSearch || undefined, clientId, limit: 100 },
    can('invoices.read'),
  )
  const invoice = useInvoice(
    invoiceId,
    z.string().uuid().safeParse(invoiceId).success && can('invoices.read'),
  )
  const bankAccounts = useBankAccounts(can('bank_accounts.read'))
  const options = invoices.data?.items ?? []
  const selected = invoice.data
  const allOptions =
    selected && !options.some((row) => row.id === selected.id) ? [selected, ...options] : options
  const changeMethod = (value: PaymentMethod) => {
    setMethod(value)
    setStatus(value === 'cash' ? 'confirmed' : 'pending')
    setValidation('')
  }
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setValidation('')
    setError(undefined)
    if (!selected || !['issued', 'sent'].includes(selected.status))
      return setValidation(t('invalidInvoice'))
    if (!PaymentInputSchema.shape.amount.safeParse(amount).success)
      return setValidation(t('invalidAmount'))
    if (cents(amount) > cents(selected.availableBalance)) return setValidation(t('exceedsBalance'))
    const resolvedStatus =
      method === 'cash' ? 'confirmed' : method === 'cheque' ? 'pending' : status
    if (method === 'bank_transfer' && resolvedStatus === 'confirmed' && !can('payments.update'))
      return setValidation(t('requiredField'))
    const payload = {
      operationId: operationId.current,
      invoiceId: selected.id,
      amount,
      currency: selected.currency,
      method,
      status: resolvedStatus,
      paymentDate,
      collectedOn:
        resolvedStatus === 'confirmed' ? (method === 'cash' ? paymentDate : collectedOn) : null,
      bankAccountId: method === 'bank_transfer' ? bankAccountId || null : null,
      reference: method === 'bank_transfer' ? reference.trim() || null : null,
      chequeBank: method === 'cheque' ? chequeBank.trim() || null : null,
      chequeNumber: method === 'cheque' ? chequeNumber.trim() || null : null,
    }
    const parsed = PaymentInputSchema.safeParse(payload)
    if (!parsed.success) return setValidation(t('requiredField'))
    if (method === 'bank_transfer' && !reference.trim()) return setValidation(t('requiredField'))
    if (method === 'cheque' && (!chequeBank.trim() || !chequeNumber.trim()))
      return setValidation(t('requiredField'))
    if (parsed.data.collectedOn && parsed.data.collectedOn > companyToday())
      return setValidation(t('invalidDate'))
    setBusy(true)
    try {
      const created = await actions.create(parsed.data)
      await refreshPayments(cache)
      operationId.current = crypto.randomUUID()
      navigate(`/payments/${created.id}`)
    } catch (cause) {
      setError(cause)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="mx-auto grid max-w-[1500px] gap-section p-page">
      <PageHeader
        eyebrow={t('sales')}
        title={t('newPayment')}
        description={t('paymentFormDescription')}
      />
      <form
        id="payment-create-page"
        onSubmit={(event) => void submit(event)}
        className="grid min-w-0 gap-content rounded-panel border border-[var(--border)] bg-[var(--surface)] p-panel"
      >
        {invoices.isError && <RequestState query={invoices} />}
        {invoice.isError && <RequestState query={invoice} />}
        {bankAccounts.isError && <RequestState query={bankAccounts} />}
        {(invoices.isPending || (invoiceId && invoice.isPending)) && (
          <p className="text-sm text-[var(--muted)]">{t('loading')}</p>
        )}
        <PaymentFields
          invoices={allOptions}
          invoiceId={invoiceId}
          invoiceSearch={invoiceSearch}
          onInvoiceSearch={setInvoiceSearch}
          onInvoice={setInvoiceId}
          invoiceLoading={invoices.isPending}
          invoiceError={invoices.isError}
          onInvoiceRetry={() => void invoices.refetch()}
          amount={amount}
          onAmount={setAmount}
          paymentDate={paymentDate}
          onPaymentDate={setPaymentDate}
          method={method}
          onMethod={changeMethod}
          status={status}
          onStatus={setStatus}
          canConfirmTransfer={can('payments.update')}
          collectedOn={collectedOn}
          onCollectedOn={setCollectedOn}
          bankAccountId={bankAccountId}
          onBankAccount={setBankAccountId}
          bankAccounts={bankAccounts.data ?? []}
          bankLoading={bankAccounts.isPending && can('bank_accounts.read')}
          bankError={bankAccounts.isError}
          onBankRetry={() => void bankAccounts.refetch()}
          reference={reference}
          onReference={setReference}
          chequeBank={chequeBank}
          onChequeBank={setChequeBank}
          chequeNumber={chequeNumber}
          onChequeNumber={setChequeNumber}
          available={
            selected
              ? { amount: selected.availableBalance, currency: selected.currency }
              : undefined
          }
        />
        {validation && (
          <p role="alert" className="text-sm text-[var(--error-text)]">
            {validation}
          </p>
        )}
        <FormError error={error} />
        <FormActionBar>
          <Link href="/payments" className={buttonVariants({ variant: 'outline' })}>
            {t('cancel')}
          </Link>
          <Button type="submit" form="payment-create-page" disabled={busy || !selected}>
            {t('savePayment')}
          </Button>
        </FormActionBar>
      </form>
    </div>
  )
}
