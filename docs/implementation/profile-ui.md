# Personal profile

Avatars open `/profile`, a preview of the signed-in user's first name, family name and email. `/profile/edit` saves these fields through `PATCH /v1/auth/profile`, using OpenAPI-generated request validation and types. Current-password confirmation is required. Staff-management permissions are not required; roles, permissions and account status cannot be changed through this endpoint.

The endpoint requires a full session, rate-limits requests, checks the password, and rechecks the session under the identity transaction lock. Email uniqueness remains database-enforced. Saving invalidates outstanding reset tokens and clears email verification; this flow does not claim to verify the new email address.

`/profile/change-password` embeds password changes in the application layout. Mandatory temporary-password onboarding uses `/set-password`. The old `/change-password` UI route has been removed entirely and falls through to the not-found page, without a redirect. Staff details no longer expose a personal password-change link. Administrators can still reissue another staff member's temporary password. Password changes continue rotating sessions. The API endpoint `/v1/auth/change-password` is unchanged.

The top-bar avatar opens an accessible dropdown with Profile and Log out. A single sun/moon icon beside it toggles and persists the theme. The sidebar profile card remains a direct profile link. Placeholder top-bar icons and sidebar password, logout, theme and empty settings controls have been removed. Staff administration remains separate from personal account management.

The shared authentication layout also exposes the same sun/moon toggle on login, recovery, reset and first-login password setup pages. Theme preference persists between public and signed-in pages. The navbar avatar uses a filled accent-gold background in both themes as an exception to outlined dark-mode actions.
