import { Upload, X } from 'lucide-react'
import type { ChangeEvent } from 'react'

import { Button } from '../../../../../components/ui/button'
import { ColorPicker } from '../../../../../components/ui/color-picker'
import { translate, useUiLanguage } from '../../../../../lib/i18n'
import type { OnboardingFieldsProps } from './onboarding-types'
export function BrandIdentityStep({ configuration: c, onChange, onUpload }: OnboardingFieldsProps) {
  useUiLanguage()

  return (
    <div className="onboarding-brand-fields">
      {(['company_logo', 'company_signature'] as const).map((purpose, index) => {
        const id = index === 0 ? c.branding.logoAssetId : c.branding.signatureAssetId
        const key = index === 0 ? 'logoAssetId' : 'signatureAssetId'
        const choose = (e: ChangeEvent<HTMLInputElement>) => {
          const file = e.target.files?.[0]
          if (file) onUpload(purpose, file)
          e.target.value = ''
        }
        return (
          <div className="onboarding-upload" key={purpose}>
            <div>
              <strong>{translate(index === 0 ? 'Company logo' : 'Signature or stamp')}</strong>
              <small>{translate('Optional · PNG, JPEG or WebP · up to 2 MB')}</small>
            </div>
            <div className="onboarding-upload-actions">
              <label className="onboarding-file-control">
                <Upload size={15} />
                {translate(id ? 'Replace image' : 'Upload image')}
                <input
                  aria-label={translate(index === 0 ? 'Upload company logo' : 'Upload signature')}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={choose}
                />
              </label>
              {id && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-md"
                  aria-label={translate('Remove image')}
                  onClick={() => onChange({ ...c, branding: { ...c.branding, [key]: null } })}
                >
                  <X size={15} />
                </Button>
              )}
            </div>
            {id && (
              <span className="onboarding-upload-ready">
                {translate('Image uploaded. See the document preview.')}
              </span>
            )}
          </div>
        )
      })}
      <div className="onboarding-field">
        <span>{translate('Document accent color')}</span>
        <ColorPicker
          id="organization-accent"
          value={c.branding.accentColor}
          onValueChange={(value) =>
            onChange({ ...c, branding: { ...c.branding, accentColor: value } })
          }
        />
      </div>
    </div>
  )
}
