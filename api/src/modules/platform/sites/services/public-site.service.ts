import { AppError } from '../../../../lib/errors.js'
import type { OrganizationHosts } from '../../../../lib/organization-hosts.js'
import type { PlatformSites, Site } from '../../../../lib/platform-sites.js'

/** Public, unauthenticated site lookups. They reveal only an organization's name and address. */
export function createPublicSiteService(sites: PlatformSites, hosts: OrganizationHosts) {
  return {
    async current(site: Site) {
      if (site.kind !== 'organization')
        return { kind: site.kind, organization: null, redirectTo: null }
      const organization = await hosts.bySlug(site.slug)
      if (organization)
        return {
          kind: site.kind,
          organization: { slug: organization.slug, name: organization.name },
          redirectTo: null,
        }
      const renamed = await hosts.byFormerSlug(site.slug)
      return {
        kind: site.kind,
        organization: null,
        redirectTo: renamed ? sites.organizationOrigin(renamed.slug) : null,
      }
    },
    async address(organizationId: string) {
      const slug = await hosts.activeSlug(organizationId)
      if (!slug) throw new AppError(404, 'NOT_FOUND', 'The requested resource was not found.')
      return { url: sites.organizationOrigin(slug) }
    },
  }
}
