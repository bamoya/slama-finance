import type { OwnerOnboardingConfiguration } from '../../../../../api/generated/models'
export type OnboardingFieldsProps = {
  step: number
  configuration: OwnerOnboardingConfiguration
  onChange: (configuration: OwnerOnboardingConfiguration) => void
  onUpload: (purpose: 'company_logo' | 'company_signature', file: File) => void
  onEdit: (step: number) => void
}
