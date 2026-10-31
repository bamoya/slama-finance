import './platform-brand.css'

import { cn } from '../../lib/utils'

/** Supplied BaMoYa artwork is fitted proportionally, without modifying the source. */
export function PlatformBrand({ className }: { className?: string }) {
  return (
    <span className={cn('platform-brand', className)}>
      <img src="/branding/bamoya-finance.png" alt="B-Finance" width="2172" height="724" />
      <img
        src="/branding/bamoya-finance.png"
        className="platform-brand-light-lettering"
        alt=""
        aria-hidden="true"
        width="2172"
        height="724"
      />
    </span>
  )
}
