import type { ReactNode } from 'react'

import { translate, useUiLanguage } from '../../../../lib/i18n'
import type { SettingsField } from './settings-form'

export function SettingsColumns({
  fields,
  renderField,
  preview,
}: {
  fields: SettingsField[]
  renderField: (field: SettingsField) => ReactNode
  preview?: ReactNode
}) {
  useUiLanguage()

  const groups: { title: string; side: boolean; fields: SettingsField[] }[] = []
  for (const field of fields) {
    if (field.hidden) continue
    const side = field.column === 'side'
    const last = groups.at(-1)
    if (field.section || !last || last.side !== side)
      groups.push({ title: field.section ?? 'Details', side, fields: [field] })
    else last.fields.push(field)
  }
  const column = (side: boolean) =>
    groups
      .filter((group) => group.side === side)
      .map((group, index) => (
        <section
          key={`${group.title}-${index}`}
          className="min-w-0 rounded-panel border border-[var(--border)] bg-[var(--surface)] p-5 md:p-panel"
        >
          <h3 className="mb-5 text-lg font-semibold">{group.title}</h3>
          <div className={side ? 'grid gap-content' : 'grid gap-content sm:grid-cols-2'}>
            {group.fields.map(renderField)}
          </div>
        </section>
      ))
  return (
    <div
      className={`grid items-start gap-section ${preview ? 'xl:grid-cols-2' : 'xl:grid-cols-[minmax(0,1fr)_340px]'}`}
    >
      <div className="min-w-0 space-y-section">{column(false)}</div>
      <aside className="min-w-0 space-y-section">
        {column(true)}
        {preview && (
          <section className="min-w-0 rounded-panel border border-[var(--border)] bg-[var(--surface)] p-5 md:p-panel">
            <h3 className="mb-5 text-lg font-semibold">{translate('Document preview')}</h3>
            {preview}
          </section>
        )}
      </aside>
    </div>
  )
}
