import { Search } from 'lucide-react'
import { useEffect, useState } from 'react'

import { Input } from '../../../../../components/ui/input'
import { translate } from '../../../../../lib/i18n'

/** Debounced search input shared by the administration lists. */
export function SearchField({
  label,
  placeholder,
  onSearch,
}: {
  label: string
  placeholder: string
  onSearch: (search: string) => void
}) {
  const [text, setText] = useState('')
  useEffect(() => {
    const timer = setTimeout(() => onSearch(text.trim()), 300)
    return () => clearTimeout(timer)
  }, [text, onSearch])
  return (
    <div className="relative min-w-48 flex-1">
      <Search
        className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--muted)]"
        aria-hidden="true"
      />
      <Input
        type="search"
        aria-label={translate(label)}
        placeholder={translate(placeholder)}
        className="pl-9"
        value={text}
        maxLength={120}
        onChange={(event) => setText(event.target.value)}
      />
    </div>
  )
}
