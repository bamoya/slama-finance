import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { OrganizationAddressField } from '../features/platform/organizations/components/onboarding/organization-address-field'
import { organizationOrigin } from './platform-sites'

describe('OrganizationAddressField', () => {
  it('shows the address with the current page scheme', () => {
    render(
      <OrganizationAddressField
        value="atlas"
        availability="available"
        conflict={false}
        onChange={() => undefined}
      />,
    )
    expect(screen.getByText(organizationOrigin('atlas'))).toBeTruthy()
  })
})
