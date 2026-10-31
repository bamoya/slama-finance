import { Info } from 'lucide-react'
import { useState } from 'react'
import { useLocation } from 'wouter'

import { createAdminOwner } from '../../../../../api/generated/administration/administration'
import { AdminOwnerCreateSchema } from '../../../../../api/generated/schemas/administration/administration.schemas'
import { FormActionBar } from '../../../../../components/management/form-action-bar'
import { FormError } from '../../../../../components/management/form-error'
import { Button } from '../../../../../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../../../../../components/ui/card'
import { DateInput } from '../../../../../components/ui/date-input'
import { Input } from '../../../../../components/ui/input'
import { Label } from '../../../../../components/ui/label'
import { Select, SelectGroup, SelectOption } from '../../../../../components/ui/select'
import { Textarea } from '../../../../../components/ui/textarea'
import { validationMessage } from '../../../../../lib/error-messages'
import { translate, useUiLanguage } from '../../../../../lib/i18n'
import { cn } from '../../../../../lib/utils'
import { cycleLabel, planLabel } from '../../../subscriptions/components/billing-format'
import { adminPaths } from '../../shared/admin-paths'
import { AdministrationLayout } from '../../shared/components/administration-layout'
import { AdministrationPageHeader } from '../../shared/components/administration-page-header'
import { coverageEnd, type Cycle, midnightUtc, todayIso } from '../components/coverage-period'
import { useRefreshAdministration } from '../hooks/use-refresh-administration'

const plans = ['essential', 'business', 'pro'] as const
const cycles: Cycle[] = ['monthly', 'annual']

type Errors = Record<string, string>

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null
  return (
    <p id={id} role="alert" className="text-sm text-[var(--error-text)]">
      {message}
    </p>
  )
}

export function AdminNewCustomerPage() {
  const language = useUiLanguage()
  const [, navigate] = useLocation()
  const refresh = useRefreshAdministration()
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [locale, setLocale] = useState<'fr' | 'en'>(language === 'en' ? 'en' : 'fr')
  const [kind, setKind] = useState<'trial' | 'paid'>('trial')
  const [planCode, setPlanCode] = useState<(typeof plans)[number]>('essential')
  const [cycle, setCycle] = useState<Cycle>('monthly')
  const [start, setStart] = useState(todayIso())
  const [end, setEnd] = useState(coverageEnd(todayIso(), 'monthly'))
  const [endEdited, setEndEdited] = useState(false)
  const [reason, setReason] = useState('')
  const [errors, setErrors] = useState<Errors>({})
  const [error, setError] = useState<unknown>(null)
  const [pending, setPending] = useState(false)
  const paid = kind === 'paid'
  const recompute = (nextStart: string, nextCycle: Cycle) => {
    if (!endEdited) setEnd(coverageEnd(nextStart, nextCycle))
  }
  const submit = async () => {
    setError(null)
    const found: Errors = {}
    const body = {
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: email.trim(),
      locale,
      reason: reason.trim(),
      subscription: paid
        ? {
            kind,
            planCode,
            cycle,
            coverageStart: start ? midnightUtc(start) : '',
            coverageEnd: end ? midnightUtc(end) : '',
          }
        : { kind },
    }
    const parsed = AdminOwnerCreateSchema.safeParse(body)
    if (!parsed.success)
      for (const issue of parsed.error.issues) {
        const key = issue.path.includes('coverageStart')
          ? 'coverageStart'
          : issue.path.includes('coverageEnd')
            ? 'coverageEnd'
            : String(issue.path[0])
        found[key] ??= validationMessage(issue.message)
      }
    if (!body.reason) found.reason = translate('Indicate the reason for this action.')
    if (paid && !found.coverageStart && !found.coverageEnd) {
      if (new Date(midnightUtc(start)).getTime() > Date.now())
        found.coverageStart = translate('The coverage cannot start in the future.')
      else if (new Date(midnightUtc(end)).getTime() <= Date.now())
        found.coverageEnd = translate('The coverage must end in the future.')
    }
    setErrors(found)
    if (Object.keys(found).length) return
    setPending(true)
    try {
      const created = await createAdminOwner(body)
      await refresh()
      navigate(`${adminPaths.customers}/${created.owner.id}`)
    } catch (failure) {
      setError(failure)
    } finally {
      setPending(false)
    }
  }
  const invalid = (name: string) => !!errors[name]
  return (
    <AdministrationLayout title="New customer">
      <AdministrationPageHeader
        title="New customer"
        description="Create a customer account and choose how their subscription starts."
        backHref={adminPaths.customers}
      />
      <form
        id="new-customer-form"
        noValidate
        className="space-y-section"
        onSubmit={(event) => {
          event.preventDefault()
          void submit()
        }}
      >
        <div
          role="note"
          className="flex gap-3 rounded-panel border border-[var(--border)] bg-[var(--accent-soft)] p-4 text-sm"
        >
          <Info className="mt-0.5 size-5 shrink-0 text-[var(--accent)]" aria-hidden="true" />
          <p>
            {translate(
              'The customer receives an email to set their password, then creates their first organization themselves.',
            )}
          </p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>{translate('Identity')}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="first-name">{translate('First name')}</Label>
              <Input
                id="first-name"
                autoComplete="off"
                value={firstName}
                maxLength={100}
                aria-invalid={invalid('firstName')}
                aria-describedby={invalid('firstName') ? 'first-name-error' : undefined}
                onChange={(event) => setFirstName(event.target.value)}
              />
              <FieldError id="first-name-error" message={errors.firstName} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="last-name">{translate('Last name')}</Label>
              <Input
                id="last-name"
                autoComplete="off"
                value={lastName}
                maxLength={100}
                aria-invalid={invalid('lastName')}
                aria-describedby={invalid('lastName') ? 'last-name-error' : undefined}
                onChange={(event) => setLastName(event.target.value)}
              />
              <FieldError id="last-name-error" message={errors.lastName} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="customer-email">{translate('Email address')}</Label>
              <Input
                id="customer-email"
                type="email"
                autoComplete="off"
                value={email}
                maxLength={254}
                aria-invalid={invalid('email')}
                aria-describedby={invalid('email') ? 'customer-email-error' : undefined}
                onChange={(event) => setEmail(event.target.value)}
              />
              <FieldError id="customer-email-error" message={errors.email} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="customer-locale">{translate('Language')}</Label>
              <Select
                id="customer-locale"
                aria-label={translate('Language')}
                value={locale}
                onValueChange={(value) => setLocale(value as 'fr' | 'en')}
              >
                <SelectGroup>
                  <SelectOption value="fr">{translate('French')}</SelectOption>
                  <SelectOption value="en">{translate('English')}</SelectOption>
                </SelectGroup>
              </Select>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{translate('Subscription')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <fieldset className="grid gap-3 sm:grid-cols-2">
              <legend className="sr-only">{translate('Subscription type')}</legend>
              {(['trial', 'paid'] as const).map((option) => (
                <label
                  key={option}
                  className={cn(
                    'flex cursor-pointer items-start gap-3 rounded-xl border p-4',
                    kind === option
                      ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
                      : 'border-[var(--border)]',
                  )}
                >
                  <input
                    type="radio"
                    name="subscription-kind"
                    className="mt-1 accent-[var(--accent)]"
                    checked={kind === option}
                    onChange={() => setKind(option)}
                  />
                  <span>
                    <span className="block font-semibold">
                      {translate(option === 'trial' ? 'Free trial' : 'Paid plan')}
                    </span>
                    <span className="block text-sm text-[var(--muted)]">
                      {translate(
                        option === 'trial'
                          ? 'The 7-day trial starts with the first organization.'
                          : 'Grant a plan for a coverage period, without a payment.',
                      )}
                    </span>
                  </span>
                </label>
              ))}
            </fieldset>
            {paid && (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="customer-plan">{translate('Plan')}</Label>
                  <Select
                    id="customer-plan"
                    aria-label={translate('Plan')}
                    value={planCode}
                    onValueChange={(value) => setPlanCode(value as (typeof plans)[number])}
                  >
                    <SelectGroup>
                      {plans.map((plan) => (
                        <SelectOption key={plan} value={plan}>
                          {planLabel(plan)}
                        </SelectOption>
                      ))}
                    </SelectGroup>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="customer-cycle">{translate('Billing cycle')}</Label>
                  <Select
                    id="customer-cycle"
                    aria-label={translate('Billing cycle')}
                    value={cycle}
                    onValueChange={(value) => {
                      setCycle(value as Cycle)
                      recompute(start, value as Cycle)
                    }}
                  >
                    <SelectGroup>
                      {cycles.map((item) => (
                        <SelectOption key={item} value={item}>
                          {cycleLabel(item)}
                        </SelectOption>
                      ))}
                    </SelectGroup>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="coverage-start">{translate('Coverage start')}</Label>
                  <DateInput
                    id="coverage-start"
                    value={start}
                    aria-invalid={invalid('coverageStart')}
                    aria-describedby={invalid('coverageStart') ? 'coverage-start-error' : undefined}
                    onChange={(event) => {
                      setStart(event.target.value)
                      recompute(event.target.value, cycle)
                    }}
                  />
                  <FieldError id="coverage-start-error" message={errors.coverageStart} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="coverage-end">{translate('Coverage end')}</Label>
                  <DateInput
                    id="coverage-end"
                    value={end}
                    aria-invalid={invalid('coverageEnd')}
                    aria-describedby={
                      invalid('coverageEnd') ? 'coverage-end-error' : 'coverage-end-hint'
                    }
                    onChange={(event) => {
                      setEnd(event.target.value)
                      setEndEdited(true)
                    }}
                  />
                  {errors.coverageEnd ? (
                    <FieldError id="coverage-end-error" message={errors.coverageEnd} />
                  ) : (
                    <p id="coverage-end-hint" className="text-xs text-[var(--muted)]">
                      {translate('Computed from the cycle; you can change it.')}
                    </p>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{translate('Reason (internal)')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Label htmlFor="creation-reason" className="sr-only">
              {translate('Reason (internal)')}
            </Label>
            <Textarea
              id="creation-reason"
              value={reason}
              maxLength={500}
              aria-invalid={invalid('reason')}
              aria-describedby={
                invalid('reason') ? 'creation-reason-error' : 'creation-reason-hint'
              }
              onChange={(event) => setReason(event.target.value)}
            />
            {errors.reason ? (
              <FieldError id="creation-reason-error" message={errors.reason} />
            ) : (
              <p id="creation-reason-hint" className="text-xs text-[var(--muted)]">
                {translate('Kept in the audit log. Never shown to the customer.')}
              </p>
            )}
          </CardContent>
        </Card>
        <FormError error={error} />
        <FormActionBar>
          <Button type="submit" form="new-customer-form" disabled={pending}>
            {pending ? translate('Please wait…') : translate('Create customer')}
          </Button>
        </FormActionBar>
      </form>
    </AdministrationLayout>
  )
}
