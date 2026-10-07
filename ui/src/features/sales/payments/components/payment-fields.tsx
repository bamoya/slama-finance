import { useTranslation } from 'react-i18next'

import type { BankAccount, InvoicePageItemsItem } from '../../../../api/generated/models'
import type { PaymentInput } from '../../../../api/generated/schemas/sales/payments.schemas'
import { Combobox } from '../../../../components/ui/combobox'
import { Input } from '../../../../components/ui/input'
import { Select, SelectOption } from '../../../../components/ui/select'
import { useUiLanguage } from '../../../../lib/i18n'

export type PaymentMethod = PaymentInput['method']
export type PaymentState = PaymentInput['status']

export function PaymentFields({
  invoices,
  invoiceId,
  invoiceSearch,
  onInvoiceSearch,
  onInvoice,
  invoiceLoading,
  invoiceError,
  onInvoiceRetry,
  amount,
  onAmount,
  paymentDate,
  onPaymentDate,
  method,
  onMethod,
  status,
  onStatus,
  collectedOn,
  onCollectedOn,
  bankAccountId,
  onBankAccount,
  bankAccounts,
  bankLoading,
  bankError,
  onBankRetry,
  reference,
  onReference,
  chequeBank,
  onChequeBank,
  chequeNumber,
  onChequeNumber,
  available,
  canConfirmTransfer,
}: {
  invoices: InvoicePageItemsItem[]
  invoiceId: string
  invoiceSearch: string
  onInvoiceSearch: (value: string) => void
  onInvoice: (value: string) => void
  invoiceLoading: boolean
  invoiceError: boolean
  onInvoiceRetry: () => void
  amount: string
  onAmount: (value: string) => void
  paymentDate: string
  onPaymentDate: (value: string) => void
  method: PaymentMethod
  onMethod: (value: PaymentMethod) => void
  status: PaymentState
  onStatus: (value: PaymentState) => void
  collectedOn: string
  onCollectedOn: (value: string) => void
  bankAccountId: string
  onBankAccount: (value: string) => void
  bankAccounts: Pick<BankAccount, 'id' | 'name' | 'bankName' | 'archivedAt'>[]
  bankLoading: boolean
  bankError: boolean
  onBankRetry: () => void
  reference: string
  onReference: (value: string) => void
  chequeBank: string
  onChequeBank: (value: string) => void
  chequeNumber: string
  onChequeNumber: (value: string) => void
  available?: { amount: string; currency: string }
  canConfirmTransfer: boolean
}) {
  useUiLanguage()

  const { t } = useTranslation('sales')
  return (
    <div className="grid min-w-0 gap-content">
      <div className="grid min-w-0 gap-2">
        <span className="text-sm font-medium">{t('selectInvoice')}</span>
        <Combobox
          value={invoiceId}
          onValueChange={onInvoice}
          aria-label={t('selectInvoice')}
          options={invoices
            .filter(
              (invoice) =>
                ['issued', 'sent'].includes(invoice.status) && Number(invoice.availableBalance) > 0,
            )
            .map((invoice) => ({
              value: invoice.id,
              label: `${invoice.number ?? t('draftInvoice')} · ${invoice.clientDisplayName} · ${invoice.availableBalance} ${invoice.currency}`,
              keywords: [invoice.clientDisplayName, invoice.number ?? ''],
            }))}
          placeholder={t('selectInvoice')}
          selectedLabel={invoices.find((invoice) => invoice.id === invoiceId)?.number ?? undefined}
          search={invoiceSearch}
          onSearchChange={onInvoiceSearch}
          loading={invoiceLoading}
          error={invoiceError}
          onRetry={onInvoiceRetry}
        />
      </div>
      <div className="grid min-w-0 gap-4 md:grid-cols-2">
        <label className="grid gap-2 text-sm font-medium">
          {t('amount')}
          <Input
            type="number"
            min="0.01"
            step="0.01"
            value={amount}
            onChange={(event) => onAmount(event.target.value)}
            required
          />
          {available && (
            <span className="text-xs font-normal text-[var(--muted)]">
              {t('paymentAmountHint', available)}
            </span>
          )}
        </label>
        <label className="grid gap-2 text-sm font-medium">
          {t('paymentDate')}
          <Input
            type="date"
            value={paymentDate}
            onChange={(event) => onPaymentDate(event.target.value)}
            required
          />
        </label>
        <label className="grid gap-2 text-sm font-medium">
          {t('method')}
          <Select
            aria-label={t('method')}
            value={method}
            onValueChange={(value) => onMethod(value as PaymentMethod)}
          >
            <SelectOption value="cash">{t('cash')}</SelectOption>
            <SelectOption value="bank_transfer">{t('bank_transfer')}</SelectOption>
            <SelectOption value="cheque">{t('cheque')}</SelectOption>
          </Select>
        </label>
        {method === 'bank_transfer' && (
          <label className="grid gap-2 text-sm font-medium">
            {t('status')}
            <Select
              aria-label={t('status')}
              value={status}
              onValueChange={(value) => onStatus(value as PaymentState)}
            >
              <SelectOption value="pending">{t('pending')}</SelectOption>
              {canConfirmTransfer && (
                <SelectOption value="confirmed">{t('confirmed')}</SelectOption>
              )}
            </Select>
          </label>
        )}
        {method === 'bank_transfer' && status === 'confirmed' && (
          <label className="grid gap-2 text-sm font-medium">
            {t('collectedOn')}
            <Input
              type="date"
              value={collectedOn}
              onChange={(event) => onCollectedOn(event.target.value)}
              required
            />
          </label>
        )}
        {method === 'bank_transfer' && (
          <>
            <label className="grid gap-2 text-sm font-medium">
              {t('reference')}
              <Input
                value={reference}
                onChange={(event) => onReference(event.target.value)}
                required
                maxLength={200}
              />
            </label>
            <label className="grid gap-2 text-sm font-medium">
              {t('bankAccount')}
              <Combobox
                value={bankAccountId}
                onValueChange={onBankAccount}
                aria-label={t('bankAccount')}
                options={bankAccounts
                  .filter((bank) => bank.archivedAt === null)
                  .map((bank) => ({
                    value: bank.id,
                    label: `${bank.name} · ${bank.bankName}`,
                    keywords: [bank.bankName],
                  }))}
                placeholder={t('bankAccount')}
                clearLabel={t('noBankAccount')}
                selectedLabel={bankAccounts.find((bank) => bank.id === bankAccountId)?.name}
                loading={bankLoading}
                error={bankError}
                onRetry={onBankRetry}
              />
            </label>
          </>
        )}
        {method === 'cheque' && (
          <>
            <label className="grid gap-2 text-sm font-medium">
              {t('chequeBank')}
              <Input
                value={chequeBank}
                onChange={(event) => onChequeBank(event.target.value)}
                required
                maxLength={200}
              />
            </label>
            <label className="grid gap-2 text-sm font-medium">
              {t('chequeNumber')}
              <Input
                value={chequeNumber}
                onChange={(event) => onChequeNumber(event.target.value)}
                required
                maxLength={100}
              />
            </label>
          </>
        )}
      </div>
      <p className="text-sm text-[var(--muted)]">
        {t(
          method === 'cash'
            ? 'paymentRuleCash'
            : method === 'cheque'
              ? 'paymentRuleCheque'
              : 'paymentRuleTransfer',
        )}
      </p>
    </div>
  )
}
