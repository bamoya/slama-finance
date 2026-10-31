import { Search } from 'lucide-react'
import { useEffect, useState } from 'react'

import { Input } from '../../../../../components/ui/input'
import { translate } from '../../../../../lib/i18n'

/** Debounced search control using the same markup as the other list pages' toolbar search. */
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
    <label className="table-search grid">
      <span className="sr-only">{translate(label)}</span>
      <div className="relative">
        <Search size={17} className="absolute left-3 top-4" />
        <Input
          type="search"
          aria-label={translate(label)}
          className="pl-10"
          value={text}
          maxLength={120}
          onChange={(event) => setText(event.target.value)}
          placeholder={translate(placeholder)}
        />
      </div>
    </label>
  )
}
