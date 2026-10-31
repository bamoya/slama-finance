import { createContext, useContext } from 'react'

import { setUiLanguage, useUiLanguage } from '../../../../lib/i18n'
import { marketingTranslate } from '../data/translations'

export const MarketingContext = createContext({ dark: false, setDark: (_value: boolean) => {} })
export function useMarketing() {
  const language = useUiLanguage()
  return {
    ...useContext(MarketingContext),
    locale: language === 'en' ? 'en' : 'fr',
    setLocale: setUiLanguage,
    t: marketingTranslate,
  }
}
