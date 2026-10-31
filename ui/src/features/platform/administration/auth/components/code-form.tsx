import { z } from 'zod'

import { AuthForm } from '../../../../../components/auth/auth-form'
import { translate } from '../../../../../lib/i18n'

const codeSchema = z.object({
  code: z.string().regex(/^[0-9]{6}$/, 'Enter the 6-digit code from your authenticator app.'),
})

export function CodeForm({ onSubmit }: { onSubmit: (code: string) => Promise<void> }) {
  return (
    <AuthForm
      schema={codeSchema}
      submitLabel={translate('Verify')}
      fields={[
        {
          name: 'code',
          label: translate('Verification code'),
          type: 'text',
          autoComplete: 'one-time-code',
        },
      ]}
      onSubmit={(value) => onSubmit(value.code ?? '')}
    />
  )
}
