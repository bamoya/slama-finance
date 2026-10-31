/** Host-based sites on one platform domain. Every host and link derives from PLATFORM_DOMAIN. */
export type Site =
  | { kind: 'public' | 'owner' | 'admin' | 'api' | 'unknown' }
  | { kind: 'organization'; slug: string }
export type SiteKind = Site['kind']

/** Names that can never be an organization address (system sites and common infrastructure). */
export const RESERVED_SLUGS: readonly string[] = [
  'app',
  'admin',
  'api',
  'www',
  'mail',
  'static',
  'assets',
  'status',
  'docs',
  'help',
  'support',
  'billing',
  'auth',
]
const slugPattern = /^[a-z0-9](?:[a-z0-9-]{1,38})[a-z0-9]$/

/** Lowercase a-z, 0-9 and inner hyphens, 3-40 characters; reserved names and IDN prefixes rejected. */
export function slugProblem(slug: string): 'SLUG_INVALID' | 'SLUG_RESERVED' | null {
  if (!slugPattern.test(slug)) return 'SLUG_INVALID'
  if (RESERVED_SLUGS.includes(slug) || slug.startsWith('xn--')) return 'SLUG_RESERVED'
  return null
}

export type PlatformSites = ReturnType<typeof createPlatformSites>

export function createPlatformSites(domain: string, scheme: 'http' | 'https') {
  const base = domain.toLowerCase()
  const origin = (prefix?: string) => `${scheme}://${prefix ? `${prefix}.` : ''}${base}`
  return {
    domain: base,
    scheme,
    secureCookies: scheme === 'https',
    origins: {
      public: origin(),
      owner: origin('app'),
      admin: origin('admin'),
      api: origin('api'),
    },
    organizationOrigin: (slug: string) => origin(slug),
    /** Same-origin check for browser mutations: the Origin must be this exact site. */
    originOf: (host: string) => `${scheme}://${host.toLowerCase()}`,
    classify(host: string | undefined): Site {
      const value = (host ?? '').trim().toLowerCase().replace(/\.$/, '')
      if (!value) return { kind: 'unknown' }
      if (value === base || value === `www.${base}`) return { kind: 'public' }
      if (!value.endsWith(`.${base}`)) return { kind: 'unknown' }
      const label = value.slice(0, -base.length - 1)
      if (label.includes('.')) return { kind: 'unknown' }
      if (label === 'app') return { kind: 'owner' }
      if (label === 'admin') return { kind: 'admin' }
      if (label === 'api') return { kind: 'api' }
      return slugProblem(label) ? { kind: 'unknown' } : { kind: 'organization', slug: label }
    },
  }
}
