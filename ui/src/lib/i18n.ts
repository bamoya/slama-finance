import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import { useTranslation } from 'react-i18next'

import { french } from './locales/fr'

export const defaultLanguage = 'fr'
export const languageStorageKey = 'slama.ui.language'
export function uiLocale() {
  return i18n.language === 'fr' ? 'fr-MA' : 'en-GB'
}
export function preferredLanguage() {
  try {
    return localStorage.getItem(languageStorageKey) === 'en' ? 'en' : defaultLanguage
  } catch {
    return defaultLanguage
  }
}

if (!i18n.isInitialized) {
  void i18n.use(initReactI18next).init({
    lng: preferredLanguage(),
    fallbackLng: 'en',
    supportedLngs: ['fr', 'en'],
    resources: { fr: { interface: french } },
    interpolation: { escapeValue: false },
    initImmediate: false,
    react: { useSuspense: false },
  })
}

const applyLanguage = (language: string) => {
  if (typeof document !== 'undefined') document.documentElement.lang = language
}
applyLanguage(i18n.language)
i18n.on('languageChanged', applyLanguage)

export async function setUiLanguage(language: 'fr' | 'en') {
  try {
    localStorage.setItem(languageStorageKey, language)
  } catch {
    /* Private browsing. */
  }
  await i18n.changeLanguage(language)
}

/** Subscribe components using translated shared labels without resetting form state. */
export function useUiLanguage() {
  return useTranslation().i18n.language
}

export function translate(phrase: string, values?: Record<string, unknown>): string {
  return String(
    i18n.t(phrase, {
      ns: 'interface',
      keySeparator: false,
      nsSeparator: false,
      defaultValue: phrase,
      ...values,
    }),
  )
}

type Messages = { [key: string]: string | Messages }
export function registerTranslations(namespace: string, english: Messages) {
  const localize = (messages: Messages): Messages =>
    Object.fromEntries(
      Object.entries(messages).map(([key, value]) => [
        key,
        typeof value === 'string' ? (french[value] ?? value) : localize(value),
      ]),
    )
  i18n.addResourceBundle('en', namespace, english, true, true)
  i18n.addResourceBundle('fr', namespace, localize(english), true, true)
}

export default i18n
