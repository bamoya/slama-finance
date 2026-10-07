import { useUiLanguage } from '../../../../lib/i18n'
import { LivePreview } from './live-preview'
export function PreviewPane({ values }: { values: Record<string, unknown> }) {
  useUiLanguage()

  return <LivePreview values={values} />
}
