import '../styles/owner-onboarding.css'

import { useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, ArrowRight, Check, CheckCircle2, Save } from 'lucide-react'
import { type FormEvent, useEffect, useRef, useState } from 'react'
import { useLocation } from 'wouter'

import {
  getGetOwnerOnboardingQueryKey,
  getGetOwnerSessionQueryKey,
  getListOwnerOrganizationsQueryKey,
  getOwnerOnboarding,
  useCompleteOwnerOnboarding,
  useCreateOwnerOrganization,
  useGetOwnerOnboarding,
  useSaveOwnerOnboarding,
  useUploadOwnerBrandAsset,
} from '../../../../api/generated/identity/identity'
import type {
  OwnerOnboarding,
  OwnerOnboardingConfiguration,
  OwnerSession,
} from '../../../../api/generated/models'
import { OwnerOnboardingConfigurationSchema } from '../../../../api/generated/schemas/identity/owner-onboarding.schemas'
import { FormError } from '../../../../components/management/form-error'
import { RequestState } from '../../../../components/management/request-state'
import { UnsavedChanges } from '../../../../components/management/unsaved-changes'
import { Button, buttonVariants } from '../../../../components/ui/button'
import { Card } from '../../../../components/ui/card'
import { ApiError } from '../../../../lib/api-error'
import { translate, useUiLanguage } from '../../../../lib/i18n'
import { formatSlug, suggestSlug } from '../../../../lib/organization-slug'
import { organizationLoginUrl } from '../../../../lib/platform-sites'
import { useOwnerAccount } from '../../identity/hooks/use-owner-account'
import { OwnerPortalLayout } from '../../shared/components/owner-portal-layout'
import { OnboardingFields } from '../components/onboarding/onboarding-fields'
import { OnboardingPreview } from '../components/onboarding/onboarding-preview'
import { useSlugAvailability } from '../hooks/use-slug-availability'
import { onboardingSteps } from '../onboarding-steps'

function OnboardingWizard({ initial }: { initial?: OwnerOnboarding }) {
  useUiLanguage()
  const owner = useOwnerAccount()
  const client = useQueryClient()
  const [, navigate] = useLocation()
  const requestId = useRef(crypto.randomUUID())
  const [configuration, setConfiguration] = useState<OwnerOnboardingConfiguration>(
    () =>
      initial?.configuration ?? {
        name: '',
        activity: null,
        company: {},
        branding: { accentColor: '#a77b28' },
        defaults: {
          layout: 'essential',
          language: owner.locale,
          currency: 'MAD',
          paymentDueDays: 15,
          estimateValidDays: 15,
          compact: false,
          vatEnabled: false,
          vatRate: 0,
        },
        invitations: [],
      },
  )
  const [saved, setSaved] = useState(initial)
  const [baseline, setBaseline] = useState(() => JSON.stringify(initial?.configuration ?? null))
  const [step, setStep] = useState(initial?.currentStep ?? 1)
  const [error, setError] = useState<unknown>(null)
  const [busy, setBusy] = useState(false)
  const [slug, setSlug] = useState(() => suggestSlug(initial?.configuration.name ?? ''))
  const [slugEdited, setSlugEdited] = useState(false)
  const [slugConflict, setSlugConflict] = useState(false)
  const availability = useSlugAvailability(slug, !initial)
  const form = useRef<HTMLFormElement>(null)
  const previousStep = useRef<number | null>(null)
  useEffect(() => {
    if (previousStep.current === step) return
    const firstStep = previousStep.current === null
    previousStep.current = step
    window.scrollTo({
      top: 0,
      behavior:
        firstStep || window.matchMedia('(prefers-reduced-motion:reduce)').matches
          ? 'instant'
          : 'smooth',
    })
    form.current
      ?.querySelector<HTMLElement>('.onboarding-form-heading h2')
      ?.focus({ preventScroll: true })
  }, [step])
  useEffect(() => {
    if (!saved?.completedAt) return
    window.scrollTo({ top: 0, behavior: 'instant' })
    document.getElementById('onboarding-success-title')?.focus({ preventScroll: true })
  }, [saved?.completedAt])
  const create = useCreateOwnerOrganization(),
    save = useSaveOwnerOnboarding(),
    complete = useCompleteOwnerOnboarding(),
    upload = useUploadOwnerBrandAsset()
  const dirty =
    !saved?.completedAt &&
    (saved
      ? JSON.stringify(configuration) !== baseline
      : !!configuration.name || !!configuration.activity)
  const isCurrentOwner = () =>
    client.getQueryData<OwnerSession>(getGetOwnerSessionQueryKey())?.owner.id === owner.id
  const apply = (value: OwnerOnboarding) => {
    // A mutation may finish after logout/account switching. Do not restore the old cache.
    if (!isCurrentOwner()) return false
    setSaved(value)
    setConfiguration(value.configuration)
    setBaseline(JSON.stringify(value.configuration))
    setStep(value.currentStep)
    client.setQueryData(getGetOwnerOnboardingQueryKey(value.organization.id), value)
    void client.invalidateQueries({ queryKey: getListOwnerOrganizationsQueryKey() })
    return true
  }
  const persist = async (nextStep: number) => {
    if (!saved) {
      if (availability !== 'available') throw new Error(translate('Choose an available address.'))
      const value = await create.mutateAsync({
        data: {
          requestId: requestId.current,
          name: configuration.name.trim(),
          slug,
          activity: configuration.activity,
        },
      })
      if (apply(value)) navigate(`/organizations/${value.organization.id}/setup`, { replace: true })
      return value
    }
    const value = await save.mutateAsync({
      organizationId: saved.organization.id,
      data: {
        configuration: OwnerOnboardingConfigurationSchema.parse(configuration),
        currentStep: nextStep,
        expectedVersion: saved.version,
      },
    })
    apply(value)
    return value
  }
  const act = async (exit = false) => {
    if (busy) return
    if (!saved?.completedAt && !form.current?.reportValidity()) return
    setError(null)
    setBusy(true)
    try {
      if (step === 6 && !exit && saved) {
        const value = await complete.mutateAsync({
          organizationId: saved.organization.id,
          data: { expectedVersion: saved.version },
        })
        apply(value)
      } else {
        await persist(exit ? step : Math.min(step + 1, 6))
        if (exit && isCurrentOwner()) navigate('/organizations')
      }
    } catch (reason) {
      if (reason instanceof ApiError && reason.code === 'SLUG_TAKEN') setSlugConflict(true)
      else setError(reason)
    } finally {
      setBusy(false)
    }
  }
  const submit = (e: FormEvent) => {
    e.preventDefault()
    void act()
  }
  const uploadImage = async (purpose: 'company_logo' | 'company_signature', file: File) => {
    if (!saved || busy) return
    setError(null)
    if (file.size > 2 * 1024 * 1024) {
      setError(new Error(translate('Images must be at most 2 MB.')))
      return
    }
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      setError(new Error(translate('Use a PNG, JPEG or WebP image.')))
      return
    }
    setBusy(true)
    try {
      const data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result).split(',')[1]!)
        reader.onerror = () => reject(new Error(translate('The image could not be read.')))
        reader.readAsDataURL(file)
      })
      const asset = await upload.mutateAsync({
        organizationId: saved.organization.id,
        data: {
          purpose,
          originalFilename: file.name,
          contentType: file.type as 'image/png' | 'image/jpeg' | 'image/webp',
          data,
        },
      })
      if (!isCurrentOwner()) return
      setConfiguration((c) => ({
        ...c,
        branding: {
          ...c.branding,
          [purpose === 'company_logo' ? 'logoAssetId' : 'signatureAssetId']: asset.id,
        },
      }))
    } catch (reason) {
      setError(reason)
    } finally {
      setBusy(false)
    }
  }
  if (saved?.completedAt)
    return (
      <Card className="owner-card onboarding-success">
        <CheckCircle2 size={44} />
        <span className="owner-eyebrow">{translate('Configuration saved')}</span>
        <h1 id="onboarding-success-title" tabIndex={-1}>
          {translate('Your organization is created.')}
        </h1>
        <strong>{saved.organization.name}</strong>
        <p>
          {translate(
            'Your company identity, branding and document defaults are ready in your independent workspace.',
          )}
        </p>
        {saved.organization.status === 'active' ? (
          <a href={organizationLoginUrl(saved.organization.slug)} className={buttonVariants()}>
            {translate('Open organization')}
            <ArrowRight size={15} />
          </a>
        ) : (
          <Button disabled={busy} onClick={() => void act()}>
            {translate('Activate organization')}
          </Button>
        )}
        <FormError error={error} />

        <ol>
          <li>{translate('Add a client.')}</li>
          <li>{translate('Add a product and its variant.')}</li>
          <li>{translate('Create an estimate or invoice.')}</li>
        </ol>
        <small>
          {translate(
            'Your administrator login and temporary password will be emailed to you. It works only once: set your own password at first login; staff invitations will then be delivered.',
          )}
        </small>
      </Card>
    )
  return (
    <div className="onboarding-page">
      <UnsavedChanges dirty={dirty} />
      <header className="owner-page-heading">
        <div>
          <span className="owner-eyebrow">{translate('New organization')}</span>
          <h1>{translate('Let’s prepare your workspace.')}</h1>
          <p>
            {translate(
              'Six clear steps. Start with the essentials and add optional details at your pace.',
            )}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          disabled={busy || (!saved && !configuration.name.trim())}
          onClick={() => void act(true)}
        >
          <Save size={15} />
          {translate('Save & exit')}
        </Button>
      </header>
      <div className="onboarding-mobile-progress">
        <span>{translate('Step {{step}} of 6', { step })}</span>
        <strong>{translate(onboardingSteps[step - 1]!)}</strong>
        <progress value={step} max={6} />
      </div>
      <div className="onboarding-grid">
        <nav className="onboarding-step-nav" aria-label={translate('Organization setup steps')}>
          <ol>
            {onboardingSteps.map((label, index) => (
              <li key={label}>
                <Button
                  type="button"
                  variant="ghost"
                  aria-current={step === index + 1 ? 'step' : undefined}
                  disabled={busy || index + 1 > step}
                  onClick={() => setStep(index + 1)}
                >
                  <i>{index + 1 < step ? <Check size={15} /> : index + 1}</i>
                  <span>{translate(label)}</span>
                </Button>
              </li>
            ))}
          </ol>
        </nav>
        <Card className="owner-card onboarding-form-card">
          <form ref={form} onSubmit={submit}>
            <div className="onboarding-form-heading">
              <span>{translate('Step {{step}} of 6', { step })}</span>
              <h2 tabIndex={-1}>{translate(onboardingSteps[step - 1]!)}</h2>
              <p>
                {translate(
                  step === 6
                    ? 'Review your information. You can still edit each section.'
                    : step === 2
                      ? 'All fields are optional. Do not invent missing information.'
                      : step === 5
                        ? 'An independent administrator account is created using your email.'
                        : 'Your progress is saved when you continue.',
                )}
              </p>
            </div>
            <FormError error={error} />
            {!!error && saved && (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  void client
                    .fetchQuery({
                      queryKey: getGetOwnerOnboardingQueryKey(saved.organization.id),
                      queryFn: () => getOwnerOnboarding(saved.organization.id),
                    })
                    .then((value) => {
                      apply(value)
                      setError(null)
                    })
                    .catch(setError)
                }}
              >
                {translate('Reload saved version')}
              </Button>
            )}
            <fieldset disabled={busy}>
              <OnboardingFields
                step={step}
                configuration={configuration}
                onChange={(next) => {
                  if (!saved && !slugEdited && next.name !== configuration.name)
                    setSlug(formatSlug(suggestSlug(next.name)))
                  setConfiguration(next)
                }}
                onUpload={(purpose, file) => void uploadImage(purpose, file)}
                onEdit={setStep}
                address={
                  saved
                    ? undefined
                    : {
                        value: slug,
                        availability,
                        conflict: slugConflict,
                        onChange: (value) => {
                          setSlug(value)
                          setSlugEdited(true)
                          setSlugConflict(false)
                        },
                      }
                }
              />
            </fieldset>
            <footer className="onboarding-actions">
              <Button
                type="button"
                variant="outline"
                disabled={step === 1 || busy}
                onClick={() => setStep(step - 1)}
              >
                <ArrowLeft size={15} />
                {translate('Previous')}
              </Button>
              <Button
                type="submit"
                disabled={busy || (!saved && step === 1 && availability !== 'available')}
              >
                {translate(busy ? 'Saving…' : step === 6 ? 'Create my organization' : 'Continue')}
                <ArrowRight size={15} />
              </Button>
            </footer>
          </form>
        </Card>
        <OnboardingPreview configuration={configuration} organizationId={saved?.organization.id} />
      </div>
    </div>
  )
}
function SavedOnboarding({ organizationId }: { organizationId: string }) {
  const query = useGetOwnerOnboarding(organizationId, { query: { retry: false } })
  if (query.isPending || query.error || !query.data) return <RequestState query={query} />
  return <OnboardingWizard key={organizationId} initial={query.data} />
}
export function OwnerOnboardingPage({ organizationId }: { organizationId?: string }) {
  return (
    <OwnerPortalLayout onboarding>
      {organizationId ? <SavedOnboarding organizationId={organizationId} /> : <OnboardingWizard />}
    </OwnerPortalLayout>
  )
}
