import type { OwnerOnboardingConfiguration } from '../../../../../api/generated/models'
import type { SlugAvailability } from '../../hooks/use-slug-availability'
export type OnboardingFieldsProps = {
  step: number
  configuration: OwnerOnboardingConfiguration
  onChange: (configuration: OwnerOnboardingConfiguration) => void
  onUpload: (purpose: 'company_logo' | 'company_signature', file: File) => void
  onEdit: (step: number) => void
  /** Present until the organization exists; the address cannot be edited afterwards. */
  address?: {
    value: string
    availability: SlugAvailability
    conflict: boolean
    onChange: (slug: string) => void
  }
}
