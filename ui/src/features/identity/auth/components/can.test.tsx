import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useSession } from '../hooks/use-session'
import { Can } from './can'

vi.mock('../hooks/use-session', () => ({ useSession: vi.fn() }))
function session(keys: string[] = [], purpose = 'full', isError = false) {
  vi.mocked(useSession).mockReturnValue({
    data: { permissionKeys: keys, purpose },
    isError,
  } as ReturnType<typeof useSession>)
}
beforeEach(() => session())
describe('global permission gate', () => {
  it('renders permitted content and responds to permission changes', () => {
    session(['bank_accounts.create'])
    const { rerender } = render(
      <Can permission="bank_accounts.create">
        <button>Create bank</button>
      </Can>,
    )
    expect(screen.getByRole('button', { name: 'Create bank' })).toBeInTheDocument()
    session([])
    rerender(
      <Can permission="bank_accounts.create">
        <button>Create bank</button>
      </Can>,
    )
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
  it('requires every permission and supports fallback content without mounting protected children', () => {
    session(['company_settings.update'])
    const child = vi.fn(() => <button>Upload signature</button>)
    const Child = child
    render(
      <Can permission={['company_settings.update', 'templates.update']} fallback="Restricted">
        <Child />
      </Can>,
    )
    expect(screen.getByText('Restricted')).toBeInTheDocument()
    expect(child).not.toHaveBeenCalled()
  })
  it.each(['password_change', 'error', 'missing'])(
    'denies %s sessions even with no required permissions',
    (state) => {
      session(['staff.read'], state === 'password_change' ? state : 'full', state === 'error')
      if (state === 'missing')
        vi.mocked(useSession).mockReturnValue({ data: null, isError: false } as ReturnType<
          typeof useSession
        >)
      render(
        <>
          <Can permission="staff.read">Private</Can>
          <Can permission={[]}>Private route</Can>
        </>,
      )
      expect(screen.queryByText('Private')).not.toBeInTheDocument()
      expect(screen.queryByText('Private route')).not.toBeInTheDocument()
    },
  )
})
