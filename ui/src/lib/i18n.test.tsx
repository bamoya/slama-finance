import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { expect, it } from 'vitest'

import { FormError } from '../components/management/form-error'
import { LanguageSwitcher } from '../components/ui/language-switcher'
import { ApiError } from './api-error'
import { validationMessage } from './error-messages'
import i18n, {
  defaultLanguage,
  preferredLanguage,
  registerTranslations,
  setUiLanguage,
  translate,
  useUiLanguage,
} from './i18n'

function LanguageProbe() {
  useUiLanguage()
  const [value, setValue] = useState('')
  return (
    <>
      <LanguageSwitcher />
      <h1>{translate('Dashboard')}</h1>
      <input
        aria-label={translate('First name')}
        value={value}
        onChange={(event) => setValue(event.target.value)}
      />
    </>
  )
}

it('defaults to French unless English was explicitly selected', async () => {
  expect(defaultLanguage).toBe('fr')
  expect(preferredLanguage()).toBe('fr')
  await setUiLanguage('en')
  expect(preferredLanguage()).toBe('en')
  await setUiLanguage('fr')
  expect(document.documentElement.lang).toBe('fr')
})

it('switches the interface without losing form input and remembers the choice', async () => {
  await setUiLanguage('fr')
  render(<LanguageProbe />)
  expect(screen.getByRole('heading', { name: 'Tableau de bord' })).toBeInTheDocument()
  fireEvent.change(screen.getByLabelText('Prénom'), { target: { value: 'Salma' } })
  fireEvent.click(screen.getByRole('button', { name: 'Langue' }))
  await waitFor(() =>
    expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeInTheDocument(),
  )
  expect(screen.getByLabelText('First name')).toHaveValue('Salma')
  expect(preferredLanguage()).toBe('en')
})

it('registers nested namespaces with matching French keys and interpolation', async () => {
  registerTranslations('localeTest', {
    actions: { save: 'Save changes' },
    count: '{{total}} records',
  })
  await setUiLanguage('fr')
  expect(i18n.t('actions.save', { ns: 'localeTest' })).toBe('Enregistrer les modifications')
  expect(i18n.t('count', { ns: 'localeTest', total: 12 })).toBe('12 documents')
})

it('localizes validation and API errors without changing transport codes', async () => {
  await setUiLanguage('fr')
  expect(validationMessage('Invalid email')).toBe('Saisissez une adresse e-mail valide.')
  expect(validationMessage('String must contain at least 12 character(s)')).toContain(
    '12 caractères',
  )
  const error = new ApiError(403, 'FORBIDDEN', 'Forbidden', 'test-reference')
  render(<FormError error={error} />)
  expect(screen.getByRole('alert')).toHaveTextContent('Vous n’avez pas la permission')
  expect(screen.getByRole('alert')).toHaveTextContent('test-reference')
  expect(error.code).toBe('FORBIDDEN')
})
