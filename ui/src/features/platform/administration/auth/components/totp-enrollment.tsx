import { Check, Copy } from 'lucide-react'
import { useState } from 'react'

import { Button } from '../../../../../components/ui/button'
import { translate } from '../../../../../lib/i18n'
import { QrCode } from './qr-code'

/** Numbered authenticator setup: install, scan the framed QR code, then enter the first code. */
export function TotpEnrollment({ otpauthUri, secret }: { otpauthUri: string; secret: string }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    void navigator.clipboard
      ?.writeText(secret)
      .then(() => setCopied(true))
      .catch(() => {})
  }
  return (
    <ol className="admin-auth-setup">
      <li>
        <span className="admin-auth-step-mark">1</span>
        <span>
          {translate(
            'Install an authenticator app such as Google Authenticator, Microsoft Authenticator or 1Password.',
          )}
        </span>
      </li>
      <li>
        <span className="admin-auth-step-mark">2</span>
        <div>
          {translate('Scan this QR code with the app.')}
          <div className="admin-auth-qr-card">
            <QrCode value={otpauthUri} label={translate('Authenticator QR code')} />
            <div className="admin-auth-secret">
              <div>
                <small>{translate('Or enter this key manually:')}</small>
                <code>{secret}</code>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={copy}>
                {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
                {translate(copied ? 'Copied' : 'Copy')}
              </Button>
            </div>
          </div>
        </div>
      </li>
      <li>
        <span className="admin-auth-step-mark">3</span>
        <span>{translate('Enter the 6-digit code it shows below.')}</span>
      </li>
    </ol>
  )
}
