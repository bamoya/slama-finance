import { translate } from '../../../../../lib/i18n'
import { QrCode } from './qr-code'

export function TotpEnrollment({ otpauthUri, secret }: { otpauthUri: string; secret: string }) {
  return (
    <div className="flex flex-col items-center gap-3">
      <QrCode value={otpauthUri} label={translate('Authenticator QR code')} />
      <p className="text-center text-sm">
        {translate('Or enter this key manually:')}{' '}
        <code className="break-all font-mono font-semibold">{secret}</code>
      </p>
    </div>
  )
}
