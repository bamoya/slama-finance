import type { AnchorHTMLAttributes } from 'react'
import { Link } from 'wouter'

import { currentSite, publicOrigin } from '../../../../lib/platform-sites'

/**
 * Marketing links are client routes on the public site. The same layout is reused on the owner
 * site, where they must leave for the public host; absolute URLs are always plain anchors.
 */
export function SiteLink({
  href,
  ...props
}: Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & { href: string }) {
  if (/^https?:\/\//.test(href)) return <a href={href} {...props} />
  if (currentSite().kind === 'public') return <Link href={href} {...props} />
  return <a href={`${publicOrigin()}${href}`} {...props} />
}
