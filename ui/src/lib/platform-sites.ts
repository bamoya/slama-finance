export type PlatformSite =
  | { kind: 'public' }
  | { kind: 'owner' }
  | { kind: 'admin' }
  | { kind: 'organization'; slug: string }
  | { kind: 'unknown' }

declare global {
  interface Window {
    __SLAMA_CONFIG__?: { platformDomain?: string; contactEmail?: string; whatsappNumber?: string }
  }
}

/** Names the API refuses as organization addresses; they never reach the organization site. */
const reservedSlugs = new Set([
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
])
const slugPattern = /^[a-z0-9](?:[a-z0-9-]{1,38})[a-z0-9]$/

/** Runtime config wins, then the build value; production falls back to the current host. */
export function resolvePlatformDomain(
  runtime: string | undefined,
  build: string | undefined,
  production: boolean,
  currentHost: string,
) {
  const value = runtime?.trim() || build?.trim() || (production ? currentHost : 'localhost:5173')
  return value.toLowerCase().replace(/\/$/, '')
}

export function platformDomain() {
  return resolvePlatformDomain(
    typeof window !== 'undefined' ? window.__SLAMA_CONFIG__?.platformDomain : undefined,
    import.meta.env.VITE_PLATFORM_DOMAIN,
    import.meta.env.PROD,
    typeof window !== 'undefined' ? window.location.host : '',
  )
}

export function classifyHost(host: string, domain: string): PlatformSite {
  const value = host.trim().toLowerCase()
  const root = domain.trim().toLowerCase()
  if (value === root || value === `www.${root}`) return { kind: 'public' }
  const suffix = `.${root}`
  if (!value.endsWith(suffix)) return { kind: 'unknown' }
  const label = value.slice(0, -suffix.length)
  if (label === 'app') return { kind: 'owner' }
  if (label === 'admin') return { kind: 'admin' }
  if (reservedSlugs.has(label) || label.startsWith('xn--') || !slugPattern.test(label))
    return { kind: 'unknown' }
  return { kind: 'organization', slug: label }
}

export function currentSite(host = window.location.host): PlatformSite {
  return classifyHost(host, platformDomain())
}

function scheme() {
  return window.location.protocol
}

export const publicOrigin = () => `${scheme()}//${platformDomain()}`
export const ownerOrigin = () => `${scheme()}//app.${platformDomain()}`
export const adminOrigin = () => `${scheme()}//admin.${platformDomain()}`
export const organizationOrigin = (slug: string) => `${scheme()}//${slug}.${platformDomain()}`
export const organizationAddress = (slug: string) => `${slug}.${platformDomain()}`
export const organizationLoginUrl = (slug: string) => `${organizationOrigin(slug)}/login`
export const organizationWorkspaceUrl = (slug: string) =>
  `${organizationOrigin(slug)}/workspace/dashboard`
