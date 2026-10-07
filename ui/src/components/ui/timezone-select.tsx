import type { ComponentProps } from 'react'

import { Combobox } from './combobox'

const timezones = Array.from(
  new Set(['Africa/Casablanca', 'UTC', ...Intl.supportedValuesOf('timeZone')]),
).sort()

/** Store IANA identifiers unchanged; searching also accepts human-readable city names. */
export function TimezoneSelect({
  value,
  ...props
}: Omit<ComponentProps<typeof Combobox>, 'options'>) {
  const options = Array.from(new Set([...timezones, ...(value ? [value] : [])])).map((zone) => ({
    value: zone,
    label: zone,
    keywords: [zone.replaceAll('_', ' ').replaceAll('/', ' ')],
  }))
  return <Combobox {...props} value={value} selectedLabel={value} options={options} />
}
