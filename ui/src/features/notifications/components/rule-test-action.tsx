import { FlaskConical } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { FormError } from '../../../components/management/form-error'
import { Button } from '../../../components/ui/button'
import { useNotificationRuleActions } from '../../settings'

export function RuleTestAction({ id }: { id: string }) {
  const { t } = useTranslation('notifications')
  const actions = useNotificationRuleActions()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>()
  const [messageId, setMessageId] = useState('')
  async function test() {
    setBusy(true)
    setError(undefined)
    setMessageId('')
    try {
      setMessageId((await actions.test(id)).messageId)
    } catch (cause) {
      setError(cause)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="flex min-w-0 flex-col items-start gap-2">
      <Button variant="outline" disabled={busy} onClick={() => void test()}>
        <FlaskConical data-icon="inline-start" />
        {t('test')}
      </Button>
      {messageId && (
        <p role="status" className="max-w-sm break-words text-sm">
          {t('testQueued', { id: messageId })}
        </p>
      )}
      <FormError error={error} />
    </div>
  )
}
