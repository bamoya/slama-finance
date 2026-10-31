import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import ts from 'typescript'
import { describe, expect, it, vi } from 'vitest'
import { Router, Switch } from 'wouter'
import { memoryLocation } from 'wouter/memory-location'

import { httpClient } from '../../../api/http'
import { publicRoutes } from '../../../app/router/public-routes'
import { setUiLanguage } from '../../../lib/i18n'
import { ownerAuthPaths } from '../../../lib/public-paths'
import { contactChannels, contactDraftUrl } from './data/contact'
import { marketingFrench, marketingTranslate } from './data/translations'

vi.mock('./hooks/use-page-motion', () => ({ usePageMotion: () => {} }))
const sources = import.meta.glob<string>(['./components/*', './pages/*', './marketing-site'], {
  query: '?raw',
  import: 'default',
  eager: true,
})
function setup(path = '/') {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  )
  window.scrollTo = vi.fn()
  const location = memoryLocation({ path, record: true })
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <Router hook={location.hook}>{children}</Router>
    </QueryClientProvider>
  )
  const view = render(<Switch>{publicRoutes}</Switch>, { wrapper })
  return { ...view, location, client }
}

describe('Public website integration', () => {
  it('links the public trial to the real generated owner registration flow and keeps the public shell on owner authentication', async () => {
    const request = vi.spyOn(httpClient, 'request').mockResolvedValue({
      data: JSON.stringify({ message: 'accepted' }),
      status: 202,
      headers: {},
    } as never)
    const { location, client } = setup()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('finally together')
    expect(request).not.toHaveBeenCalled()
    expect(document.documentElement).toHaveClass('marketing-document')
    const trial = screen.getAllByRole('link', { name: /Try free for 7 days/ })[0]!
    expect(trial).toHaveAttribute('href', ownerAuthPaths.register)
    fireEvent.click(trial)
    expect(
      await screen.findByRole('heading', { name: 'Create your owner account' }),
    ).toBeInTheDocument()
    expect(location.history.at(-1)).toBe(ownerAuthPaths.register)
    expect(screen.getByRole('navigation', { name: 'Main navigation' })).toBeInTheDocument()
    expect(document.documentElement).toHaveClass('marketing-document')
    fireEvent.change(screen.getByLabelText('Email address'), {
      target: { value: 'new@example.test' },
    })
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'owner-password-2026' },
    })
    fireEvent.change(screen.getByLabelText('Confirm password'), {
      target: { value: 'owner-password-2026' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }))
    await waitFor(() =>
      expect(request).toHaveBeenCalledWith(
        expect.objectContaining({
          url: '/v1/owner-auth/register',
          data: { email: 'new@example.test', password: 'owner-password-2026', locale: 'en' },
        }),
      ),
    )
    expect(await screen.findByRole('status')).toHaveTextContent('email will arrive')
    client.clear()
  })

  it.each(['/auth/login', '/owner/login'])('preserves owner sign-in through %s', (path) => {
    const { client } = setup(path)
    expect(screen.getByRole('heading', { name: 'Owner sign in' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Staff sign in' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Log in' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Create account' })).toHaveAttribute(
      'href',
      ownerAuthPaths.register,
    )
    client.clear()
  })

  it.each([
    [ownerAuthPaths.register, 'Create your owner account'],
    [ownerAuthPaths.forgot, 'Reset your owner password'],
    [ownerAuthPaths.reset, 'Choose a new owner password'],
    [ownerAuthPaths.verify, 'Verify your owner email'],
    [ownerAuthPaths.resend, 'Resend verification email'],
  ])('serves the owner account page at %s', (path, title) => {
    const { client } = setup(path)
    expect(screen.getByRole('heading', { name: title })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Staff sign in' })).not.toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Main navigation' })).toBeInTheDocument()
    client.clear()
  })

  it('cleans up the public shell when leaving owner authentication', () => {
    const { client, unmount } = setup(ownerAuthPaths.login)
    expect(document.documentElement).toHaveClass('marketing-document')
    unmount()
    expect(document.documentElement).not.toHaveClass('marketing-document')
    expect(screen.queryByRole('navigation', { name: 'Main navigation' })).not.toBeInTheDocument()
    client.clear()
  })

  it('uses the shared language state and does not simulate contact delivery', async () => {
    const { client } = setup('/contact')
    expect(screen.getByRole('button', { name: 'Prepare my email' })).toBeDisabled()
    expect(
      screen.getByText('A contact email must be configured before this form can be used.'),
    ).toBeInTheDocument()
    await setUiLanguage('fr')
    expect(await screen.findByRole('button', { name: 'Préparer mon email' })).toBeDisabled()
    expect(localStorage.getItem('slama.ui.language')).toBe('fr')
    expect(screen.queryByText(/SIMULATION/)).not.toBeInTheDocument()
    client.clear()
  })

  it('includes real account links and ships no local mockup dependencies', () => {
    for (const source of Object.values(sources)) {
      expect(source).not.toMatch(
        /localhost:517[45]|\.local\/|EntryDialog|setEntry|SIMULATION COMPLETE/,
      )
    }
  })

  it('covers public copy in French and preserves interpolations', () => {
    const missing = new Set<string>()
    for (const source of Object.values(sources)) {
      const file = ts.createSourceFile(
        'source.tsx',
        source,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TSX,
      )
      const visit = (node: ts.Node) => {
        if (
          ts.isCallExpression(node) &&
          node.expression.getText(file) === 't' &&
          node.arguments[0] &&
          ts.isStringLiteral(node.arguments[0]) &&
          !Object.hasOwn(marketingFrench, node.arguments[0].text)
        )
          missing.add(node.arguments[0].text)
        ts.forEachChild(node, visit)
      }
      visit(file)
    }
    expect([...missing]).toEqual([])
    for (const [en, fr] of Object.entries(marketingFrench))
      expect(fr.match(/\{\{[^}]+\}\}/g)?.sort() ?? []).toEqual(
        en.match(/\{\{[^}]+\}\}/g)?.sort() ?? [],
      )
    expect(marketingTranslate('Features')).toBe('Features')
  })
})

describe('Public contact configuration', () => {
  it('validates public channels without accepting arbitrary WhatsApp links or email headers', () => {
    window.__SLAMA_CONFIG__ = {
      contactEmail: 'hello@example.test',
      whatsappNumber: '+212 600 123 456',
    }
    expect(contactChannels()).toMatchObject({
      email: 'hello@example.test',
      whatsapp: '212600123456',
    })
    window.__SLAMA_CONFIG__ = {
      contactEmail: 'a@example.test\r\nBcc:someone@example.test',
      whatsappNumber: 'javascript:alert(1)',
    }
    expect(contactChannels()).toMatchObject({ email: null, whatsapp: null })
    delete window.__SLAMA_CONFIG__
  })
  it('prepares an encoded draft without sending a request or fabricating a booking', () => {
    const url = contactDraftUrl(
      'hello@example.test',
      'demo',
      {
        name: 'Sara & Amine',
        email: 'sara@example.test',
        company: '',
        phone: '',
        message: 'Help with <invoices>',
        availability: 'Tuesday afternoon',
        subject: 'general',
      },
      'en',
    )
    const parsed = new URL(url)
    expect(parsed.protocol).toBe('mailto:')
    expect(parsed.searchParams.get('subject')).toContain('Demo request')
    expect(parsed.searchParams.get('body')).toContain('Name: Sara & Amine')
    expect(parsed.searchParams.get('body')).not.toContain('Business:')
  })
})
