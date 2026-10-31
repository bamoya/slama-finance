import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { httpClient } from '../../../../api/http'
import { apiRequest } from '../../../../api/http'
import { OrganizationUnavailable } from './components/organization-unavailable'

describe('organization unavailable', () => {
  it('is a static page with no actions and no reasons', () => {
    render(<OrganizationUnavailable />)
    expect(
      screen.getByRole('heading', { name: 'Organization temporarily unavailable' }),
    ).toBeInTheDocument()
    expect(screen.queryAllByRole('button')).toHaveLength(0)
    expect(screen.queryAllByRole('link')).toHaveLength(0)
    expect(screen.queryByText(/reason/i)).toBeNull()
  })

  it('is reached when the API answers ORGANIZATION_SUSPENDED to an organization request', async () => {
    vi.spyOn(httpClient, 'request').mockResolvedValue({
      data: JSON.stringify({ code: 'ORGANIZATION_SUSPENDED', message: 'unavailable' }),
      status: 403,
      headers: {},
    } as never)
    const heard = vi.fn()
    window.addEventListener('slama:organization-unavailable', heard)
    await expect(apiRequest({ url: '/v1/clients', method: 'GET' })).rejects.toMatchObject({
      code: 'ORGANIZATION_SUSPENDED',
    })
    window.removeEventListener('slama:organization-unavailable', heard)
    expect(heard).toHaveBeenCalledTimes(1)
  })
})
