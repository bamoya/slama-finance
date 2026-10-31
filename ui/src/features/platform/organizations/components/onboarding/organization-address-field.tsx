import { Check, LoaderCircle } from 'lucide-react'

import { Input } from '../../../../../components/ui/input'
import { translate, useUiLanguage } from '../../../../../lib/i18n'
import { formatSlug } from '../../../../../lib/organization-slug'
import { organizationOrigin } from '../../../../../lib/platform-sites'
import type { SlugAvailability } from '../../hooks/use-slug-availability'

const messages: Record<Exclude<SlugAvailability, 'empty' | 'checking' | 'available'>, string> = {
  taken: 'This address is already taken.',
  reserved: 'This address is reserved. Choose another one.',
  invalid: 'Use 3 to 40 letters, digits or hyphens, without a hyphen at the start or the end.',
}

export function OrganizationAddressField({
  value,
  availability,
  conflict,
  onChange,
}: {
  value: string
  availability: SlugAvailability
  /** Set when the create request lost a race for the address. */
  conflict: boolean
  onChange: (slug: string) => void
}) {
  useUiLanguage()
  const problem = conflict
    ? messages.taken
    : availability === 'taken' || availability === 'reserved' || availability === 'invalid'
      ? messages[availability]
      : null
  return (
    <div className="onboarding-field is-wide">
      <label htmlFor="organization-address">
        <span>
          {translate('Organization address')} <small>{translate('Required')}</small>
        </span>
      </label>
      <Input
        id="organization-address"
        required
        maxLength={40}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        value={value}
        aria-invalid={!!problem}
        aria-describedby="organization-address-status"
        onChange={(event) => onChange(formatSlug(event.target.value))}
        onBlur={() => onChange(formatSlug(value, true))}
      />
      <small>
        {translate('Your team signs in at')} <strong>{organizationOrigin(value || '…')}</strong>
      </small>
      <small id="organization-address-status" role={problem ? 'alert' : 'status'}>
        {problem ? (
          translate(problem)
        ) : availability === 'checking' ? (
          <>
            <LoaderCircle size={13} aria-hidden="true" /> {translate('Checking availability…')}
          </>
        ) : availability === 'available' ? (
          <>
            <Check size={13} aria-hidden="true" /> {translate('This address is available.')}
          </>
        ) : null}
      </small>
      <small>{translate('Only the B-Finance team can change this address later.')}</small>
    </div>
  )
}
