import { FormError } from '../../../../components/management/form-error'
import { Button } from '../../../../components/ui/button'
import { translate, useUiLanguage } from '../../../../lib/i18n'
import { useLogout } from '../hooks/use-logout'
export function LogoutButton() {
  useUiLanguage()

  const mutation = useLogout()
  return (
    <div className="w-full">
      <Button
        variant="outline"
        size="lg"
        className="w-full"
        disabled={mutation.isPending}
        onClick={() => mutation.mutate()}
      >
        {mutation.isPending ? translate('Logging out…') : translate('Log out')}
      </Button>
      <FormError error={mutation.error} />
    </div>
  )
}
