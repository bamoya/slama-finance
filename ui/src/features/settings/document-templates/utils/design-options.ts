import type { CreateDocumentTemplate } from '../../../../api/generated/schemas/settings/settings.schemas'

export const templateLayouts = [
  'classic',
  'modern',
  'minimal',
  'signature',
  'atelier',
  'ledger',
  'essential',
] as const satisfies readonly CreateDocumentTemplate['layout'][]
export const layoutLabelKey = (layout: string) =>
  layout === 'signature' ? 'signatureTheme' : layout
