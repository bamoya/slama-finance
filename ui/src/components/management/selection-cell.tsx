import './bulk-i18n'

import { useTranslation } from 'react-i18next'

import { useUiLanguage } from '../../lib/i18n'
import { Checkbox } from '../ui/checkbox'

export type TableSelection = {
  ids: string[]
  all: boolean
  some: boolean
  toggle: (id: string, checked: boolean) => void
  togglePage: (checked: boolean) => void
}

export function SelectionHeader({ selection }: { selection: TableSelection }) {
  useUiLanguage()

  const { t } = useTranslation('bulk')
  return (
    <th className="w-12 px-5 py-3">
      <Checkbox
        aria-label={t('selectPage')}
        checked={selection.all || (selection.some ? 'indeterminate' : false)}
        onCheckedChange={(checked) => selection.togglePage(checked === true)}
      />
    </th>
  )
}
export function SelectionCell({
  selection,
  id,
  name,
}: {
  selection: TableSelection
  id: string
  name: string
}) {
  useUiLanguage()

  const { t } = useTranslation('bulk')
  return (
    <td className="w-12 px-5 py-4">
      <Checkbox
        aria-label={t('selectRow', { name })}
        checked={selection.ids.includes(id)}
        onCheckedChange={(checked) => selection.toggle(id, checked === true)}
      />
    </td>
  )
}
