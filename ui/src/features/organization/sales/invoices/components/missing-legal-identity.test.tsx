import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Router } from 'wouter'
import { memoryLocation } from 'wouter/memory-location'

import { ApiError } from '../../../../../lib/api-error'
const permissions = vi.hoisted(() => ({ keys: new Set<string>() }))
vi.mock('../../../identity', () => ({
  useAuthorization: () => ({ can: (key: string) => permissions.keys.has(key) }),
}))
import { isMissingLegalIdentity } from './legal-identity-error'
import { MissingLegalIdentity } from './missing-legal-identity'

const refusal = new ApiError(
  409,
  'MISSING_LEGAL_IDENTITY',
  'Complete the company legal identity in company settings before issuing a legal invoice.',
  undefined,
  {
    ice: ['Required to issue a legal invoice for this company type.'],
    registrationNumber: ['Required to issue a legal invoice for this company type.'],
    shareCapital: ['Required to issue a legal invoice for this company type.'],
  },
)

describe('missing legal identity error', () => {
  it('is recognised only for the issue gate code', () => {
    expect(isMissingLegalIdentity(refusal)).toBe(true)
    expect(isMissingLegalIdentity(new ApiError(409, 'INVALID_STATUS', 'x'))).toBe(false)
    expect(isMissingLegalIdentity(new Error('x'))).toBe(false)
  })
  it('lists every missing field and links to the read page of company settings', () => {
    permissions.keys = new Set(['company_settings.read'])
    render(
      <Router hook={memoryLocation({ path: '/invoices/1' }).hook}>
        <MissingLegalIdentity error={refusal} />
      </Router>,
    )
    expect(screen.getByRole('alert')).toHaveTextContent('cannot be issued as a legal invoice yet')
    expect(screen.getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'ICE',
      'Commercial register (RC)',
      'Share capital (MAD)',
    ])
    expect(screen.getByRole('link', { name: 'Open company settings' })).toHaveAttribute(
      'href',
      '/settings/company',
    )
  })
  it('shows plain text instead of a link without company settings access', () => {
    permissions.keys = new Set()
    render(
      <Router hook={memoryLocation({ path: '/invoices/1' }).hook}>
        <MissingLegalIdentity error={refusal} />
      </Router>,
    )
    expect(screen.queryByRole('link')).toBeNull()
    expect(screen.getByRole('alert')).toHaveTextContent('Ask an administrator')
  })
})
