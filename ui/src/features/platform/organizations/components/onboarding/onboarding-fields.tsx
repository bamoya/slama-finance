import { BrandIdentityStep } from './brand-identity-step'
import { CompanyIdentityStep } from './company-identity-step'
import { DocumentDefaultsStep } from './document-defaults-step'
import type { OnboardingFieldsProps } from './onboarding-types'
import { OrganizationStep } from './organization-step'
import { ReviewStep } from './review-step'
import { TeamStep } from './team-step'

export function OnboardingFields(props: OnboardingFieldsProps) {
  const Step =
    [
      OrganizationStep,
      CompanyIdentityStep,
      BrandIdentityStep,
      DocumentDefaultsStep,
      TeamStep,
      ReviewStep,
    ][props.step - 1] ?? ReviewStep
  return <Step {...props} />
}
