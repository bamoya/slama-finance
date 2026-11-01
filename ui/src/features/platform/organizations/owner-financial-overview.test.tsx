import { render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'

import type { GetOwnerFinancialSummary200 } from '../../../api/generated/models'
import i18n from '../../../lib/i18n'
import { OwnerFinancialSummary } from './components/owner-financial-overview'

const data = {
  currency: 'MAD',
  totals: { revenue: '1020486.00', collected: '800.00', outstanding: '450.5', overdue: '0' },
} as GetOwnerFinancialSummary200

const initial = i18n.language
afterEach(async () => {
  await i18n.changeLanguage(initial)
})

it('formats owner amounts with French grouping spaces and decimal comma', async () => {
  await i18n.changeLanguage('fr')
  render(<OwnerFinancialSummary data={data} />)
  const text = screen.getByRole('region').textContent ?? ''
  expect(text).toContain('1 020 486,00')
  expect(text).not.toContain('1.020.486')
})

it('formats owner amounts with the shared non-breaking group space', async () => {
  await i18n.changeLanguage('en')
  render(<OwnerFinancialSummary data={data} />)
  expect(screen.getByRole('region').textContent).toContain('1\u00a0020\u00a0486.00')
})
