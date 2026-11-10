import {
  confirmAdminTotp,
  resetAdminTotp,
} from '../../../../../api/generated/administration/administration'
import type { AdminTotpEnrollment } from '../../../../../api/generated/models'
import { Button } from '../../../../../components/ui/button'
import { translate, useUiLanguage } from '../../../../../lib/i18n'
import { CodeForm } from '../../auth/components/code-form'
import { TotpEnrollment } from '../../auth/components/totp-enrollment'

/** Starts a replacement authenticator; the old one keeps working until the new code is confirmed. */
export function TotpReplacementPanel({
  enrollment,
  onStart,
  onConfirmed,
  onCancel,
  onError,
  protectedRun,
}: {
  enrollment: AdminTotpEnrollment | null
  onStart: (enrollment: AdminTotpEnrollment) => void
  onConfirmed: () => void
  onCancel: () => void
  onError: (error: unknown) => void
  protectedRun: (action: () => Promise<void>) => Promise<void>
}) {
  useUiLanguage()
  if (!enrollment)
    return (
      <Button
        type="button"
        variant="outline"
        onClick={() =>
          void protectedRun(async () => onStart(await resetAdminTotp())).catch(onError)
        }
      >
        {translate('Replace authenticator app')}
      </Button>
    )
  return (
    <div className="space-y-content">
      <TotpEnrollment otpauthUri={enrollment.otpauthUri} secret={enrollment.secret} />
      <CodeForm
        onSubmit={(code) =>
          protectedRun(async () => {
            await confirmAdminTotp({ code })
            onConfirmed()
          })
        }
      />
      <Button type="button" variant="ghost" onClick={onCancel}>
        {translate('Cancel')}
      </Button>
    </div>
  )
}
