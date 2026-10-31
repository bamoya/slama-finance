import { useEffect, useState } from 'react'

import { checkOwnerOrganizationSlug } from '../../../../api/generated/identity/identity'
import { minimumSlugLength } from '../components/onboarding/organization-slug'

export type SlugAvailability = 'empty' | 'checking' | 'available' | 'taken' | 'reserved' | 'invalid'

/** Debounced availability check; the creation request remains the atomic authority. */
export function useSlugAvailability(slug: string, enabled = true, delay = 400): SlugAvailability {
  const [result, setResult] = useState<{ slug: string; state: SlugAvailability } | null>(null)
  const local: SlugAvailability | null = !slug
    ? 'empty'
    : slug.length < minimumSlugLength || slug.endsWith('-')
      ? 'invalid'
      : null
  useEffect(() => {
    if (!enabled || local) return
    let active = true
    const timer = setTimeout(() => {
      checkOwnerOrganizationSlug({ slug })
        .then((value) => {
          if (active)
            setResult({
              slug,
              state: value.available ? 'available' : (value.reason ?? 'invalid'),
            })
        })
        .catch(() => {
          // An unreachable check must not block the user: creation still validates.
          if (active) setResult({ slug, state: 'available' })
        })
    }, delay)
    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [slug, enabled, local, delay])
  if (local) return local
  return result?.slug === slug ? result.state : 'checking'
}
