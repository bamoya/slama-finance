import type { SettingsField } from './settings-form'

export function formValues(fields: SettingsField[], source: object): Record<string, unknown> {
  const values = source as Record<string, unknown>
  return Object.fromEntries(
    fields.map((field) => [
      field.name,
      values[field.name] ?? (field.nullable ? null : field.type === 'boolean' ? false : ''),
    ]),
  )
}
