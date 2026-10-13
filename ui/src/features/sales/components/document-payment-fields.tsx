import type { EstimateInput } from '../../../api/generated/schemas/sales/estimates.schemas'
import { Combobox } from '../../../components/ui/combobox'
import { Select, SelectOption } from '../../../components/ui/select'
import { translate, useUiLanguage } from '../../../lib/i18n'
import { useAuthorization } from '../../identity'
import { useBankAccounts } from '../../settings'

export function AgreedPaymentMethodSelect({
  value,
  onChange,
}: {
  value: EstimateInput['agreedPaymentMethod']
  onChange: (value: EstimateInput['agreedPaymentMethod']) => void
}) {
  useUiLanguage()
  return (
    <label className="grid gap-2 text-sm font-medium">
      {translate('Agreed payment method')}
      <Select
        value={value ?? 'unspecified'}
        onValueChange={(next) =>
          onChange(next === 'unspecified' ? null : (next as EstimateInput['agreedPaymentMethod']))
        }
      >
        <SelectOption value="unspecified">{translate('Not specified')}</SelectOption>
        <SelectOption value="cash">{translate('Cash')}</SelectOption>
        <SelectOption value="bank_transfer">{translate('Bank transfer')}</SelectOption>
        <SelectOption value="cheque">{translate('Cheque')}</SelectOption>
      </Select>
    </label>
  )
}

export function DocumentBankPicker({
  value,
  onChange,
}: {
  value: EstimateInput['bankAccountId']
  onChange: (value: EstimateInput['bankAccountId']) => void
}) {
  useUiLanguage()
  const { can } = useAuthorization()
  const banks = useBankAccounts(can('bank_accounts.read'))
  if (!can('bank_accounts.read')) return null
  return (
    <label className="grid gap-2 text-sm font-medium">
      {translate('Bank details')}
      <Combobox
        aria-label={translate('Bank details')}
        value={value === undefined ? 'default' : (value ?? 'none')}
        onValueChange={(next) =>
          onChange(next === 'default' ? undefined : next === 'none' || !next ? null : next)
        }
        options={[
          { value: 'default', label: translate('Company default') },
          { value: 'none', label: translate('Hide bank details') },
          ...(banks.data ?? [])
            .filter((bank) => !bank.archivedAt)
            .map((bank) => ({ value: bank.id, label: `${bank.name} — ${bank.bankName}` })),
        ]}
        selectedLabel={
          value && !banks.data?.some((bank) => bank.id === value)
            ? translate('Selected bank account')
            : undefined
        }
        loading={banks.isPending}
        error={banks.isError}
        onRetry={() => void banks.refetch()}
      />
    </label>
  )
}
