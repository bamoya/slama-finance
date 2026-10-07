import { Toaster as Sonner } from 'sonner'

import { translate, useUiLanguage } from '../../lib/i18n'

/** Shared feedback surface uses the same semantic palette in both themes. */
export function Toaster() {
  useUiLanguage()
  return (
    <Sonner
      closeButton
      position="bottom-right"
      containerAriaLabel={translate('Notifications')}
      toastOptions={{
        closeButtonAriaLabel: translate('Close'),
        style: { background: 'var(--surface)', color: 'var(--text)', borderColor: 'var(--border)' },
      }}
    />
  )
}
