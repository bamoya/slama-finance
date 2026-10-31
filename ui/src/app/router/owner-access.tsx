import { AcceptOwnerInvitationPage, OwnerAuthPage } from '../../features/platform'
import { PublicSiteLayout } from '../../features/platform/marketing'

/** Keep public presentation composition outside the identity domain. */
export function OwnerAccess({ mode }: { mode: Parameters<typeof OwnerAuthPage>[0]['mode'] }) {
  return (
    <PublicSiteLayout>
      <OwnerAuthPage mode={mode} />
    </PublicSiteLayout>
  )
}

export function OwnerInvitationAccess() {
  return (
    <PublicSiteLayout>
      <AcceptOwnerInvitationPage />
    </PublicSiteLayout>
  )
}
