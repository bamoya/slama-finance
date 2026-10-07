import { Monitor, Smartphone } from 'lucide-react'
import { useEffect, useState } from 'react'

import { FormError } from '../../../components/management/form-error'
import { Button } from '../../../components/ui/button'
import { translate, useUiLanguage } from '../../../lib/i18n'
import { type NotificationRuleUpdate, useNotificationRulePreview } from '../../settings'

export function RuleEmailPreview({ id, value }: { id: string; value: NotificationRuleUpdate }) {
  useUiLanguage()
  const { mutateAsync } = useNotificationRulePreview()
  const [result, setResult] = useState<Awaited<ReturnType<typeof mutateAsync>>>()
  const [error, setError] = useState<unknown>(),
    [loading, setLoading] = useState(true)
  const [mobile, setMobile] = useState(false)
  useEffect(() => {
    let current = true
    setLoading(true)
    const timer = setTimeout(() => {
      void mutateAsync({
        id,
        data: {
          subjectTemplate: value.subjectTemplate,
          bodyTemplate: value.bodyTemplate,
          bodyFormat: value.bodyFormat ?? 'text',
          locale: value.locale,
        },
      })
        .then((data) => {
          if (current) {
            setResult(data)
            setError(undefined)
          }
        })
        .catch((cause: unknown) => {
          if (current) {
            setError(cause)
            setResult(undefined)
          }
        })
        .finally(() => {
          if (current) setLoading(false)
        })
    }, 600)
    return () => {
      current = false
      clearTimeout(timer)
    }
  }, [id, value.subjectTemplate, value.bodyTemplate, value.bodyFormat, value.locale, mutateAsync])
  return (
    <section
      className="min-w-0 space-y-3 rounded-xl border border-border bg-muted/20 p-3"
      aria-label={translate('Email preview')}
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-semibold">{translate('Email preview')}</h3>
        <div className="flex gap-1">
          <Button
            type="button"
            size="icon"
            variant={!mobile ? 'default' : 'outline'}
            aria-label={translate('Desktop preview')}
            aria-pressed={!mobile}
            onClick={() => setMobile(false)}
          >
            <Monitor />
          </Button>
          <Button
            type="button"
            size="icon"
            variant={mobile ? 'default' : 'outline'}
            aria-label={translate('Mobile preview')}
            aria-pressed={mobile}
            onClick={() => setMobile(true)}
          >
            <Smartphone />
          </Button>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        {translate(
          'Synthetic sample data only. No email is sent. Save changes before using the test action on the rule.',
        )}
      </p>
      <FormError error={error} />
      {loading && (
        <p role="status" className="text-xs text-muted-foreground">
          {translate('Updating preview…')}
        </p>
      )}
      {!loading && result?.modified && (
        <p role="status" className="rounded-lg border border-border bg-muted p-2 text-xs">
          {translate(
            'HTML was normalized for email safety. Review this preview: only the safe content shown will be saved and sent.',
          )}
        </p>
      )}
      {result && (
        <>
          <p className="break-words text-sm font-medium">{result.subject}</p>
          <iframe
            title={translate('Email preview')}
            sandbox=""
            referrerPolicy="no-referrer"
            className={`mx-auto h-[32rem] max-w-full rounded-lg border border-border bg-white ${mobile ? 'w-[360px]' : 'w-full'}`}
            srcDoc={`<!doctype html><html><head><meta charset="UTF-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><style>body{margin:0;overflow-wrap:anywhere}</style></head><body>${result.html}</body></html>`}
          />
          <details className="text-xs">
            <summary className="cursor-pointer text-muted-foreground">
              {translate('Plain-text alternative')}
            </summary>
            <pre className="mt-2 whitespace-pre-wrap break-words font-sans">{result.text}</pre>
          </details>
        </>
      )}
    </section>
  )
}
