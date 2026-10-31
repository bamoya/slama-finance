import { AdminLoginSchema } from '../../../../../api/generated/schemas/administration/administration.schemas'
import { AuthForm } from '../../../../../components/auth/auth-form'
import { translate } from '../../../../../lib/i18n'

export function CredentialsForm({
  onSubmit,
}: {
  onSubmit: (value: { email: string; password: string }) => Promise<void>
}) {
  return (
    <AuthForm
      schema={AdminLoginSchema}
      submitLabel={translate('Log in')}
      revealPasswords
      fields={[
        {
          name: 'email',
          label: translate('Email address'),
          type: 'email',
          autoComplete: 'username',
        },
        {
          name: 'password',
          label: translate('Password'),
          type: 'password',
          autoComplete: 'current-password',
        },
      ]}
      onSubmit={(value) => onSubmit({ email: value.email ?? '', password: value.password ?? '' })}
    />
  )
}
