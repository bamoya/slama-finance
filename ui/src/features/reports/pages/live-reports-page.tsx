import { Redirect } from 'wouter'

import { useUiLanguage } from '../../../lib/i18n'

/** Compatibility bookmark only; reporting has a single visual destination. */
export function LiveReportsPage() {
  useUiLanguage()

  return <Redirect to="/reports" replace />
}
