# Delegation tasks and acceptance criteria

Every task preserves module boundaries, generated transport contracts, existing staff creation and independent IAM. The original queue delegated edits to OpenCode for orchestrator review. After provider limits were reached, the user authorized Codex to finish the remaining implementation and review; completion evidence is recorded in progress.md.

## 01 — Contract

Add identity OpenAPI definitions for organization-scoped invitation list/create/resend/revoke and public token inspect/accept. Use standard error and pagination models, safe response fields and existing password constraints. Generate both clients and validate contracts/types. No implemented routes in this task.

## 02 — Persistence

Add tenant invitation, invitation-role and delivery persistence under db/schema. Enforce organization scoping, scoped user/role foreign keys, unique active email, status and lease checks. Keep only token hashes. Store inviter and accepted-user references without allowing cross-tenant links. Define behavior when a role or inviter is deleted. Export schema, update runtime grants, RLS/reference SQL and regenerate the fresh baseline/snapshot. Test baseline replay, constraints, RLS and privileged-connection scoping using the isolated test database.

## 03 — Management API

Create organization/identity/staff/invitations with controller/service/repository layers. Implement list, create, resend and revoke using generated schemas. Reuse permission middleware plus transactional permission/role checks. Validate normalized email, existing accounts, active inviter, role scope and anti-escalation. Resend rotates token/delivery generation and is throttled. Revocation is idempotent and fences in-flight delivery. No plaintext token response. Add integration coverage for permissions and tenant isolation.

## 04 — Security delivery

Extend integration contracts with injectable invitation delivery. Reuse Resend/SMTP provider composition and branded escaped French/English HTML with plaintext fallback. Worker generates an opaque token in memory, stores only its hash, and sends the acceptance URL with token in URL fragment. Claim jobs with leases/SKIP LOCKED; fence finish and retries. At most five delivery attempts; errors must not disclose credentials. Security delivery remains independent of notification rules and business email quota. Verify retries invalidate previous links and paused organizations are skipped.

## 05 — Acceptance

Add public organization-scoped inspect and accept endpoints with rate limits. Validate token hash, expiry, status, organization/subscription availability, inviter authority and role grants. Lock invitation and quota owner consistently; atomically create ordinary user with permanent selected password, assign roles, consume token and record acceptance. Recheck existing account conflict. No platform account mutation, no auto-login. Test simultaneous replay and final-seat competition with real transactions.

## 06 — UI

Add pending invitations alongside staff management using shared table/pagination/filter/action components and Can authorization. Add invitation create form and resend/revoke confirmations. Show status and delivery errors clearly. Add public organization acceptance page with token-fragment extraction and removal from browser history; inspect/accept through generated hooks and the shared request client. Reuse auth form/layout, show organization identity and safe expired/revoked/used/unavailable states. Support French/English, dark mode, keyboard and mobile. No separate query cache or direct ad hoc requests.

## 07 — Onboarding bridge

Expose narrowly scoped invitation provisioning through organization identity public API. Platform onboarding passes prepared invitations inside activation transaction without authenticating platform owners as staff. Associate authority with the initial ordinary administrator. Administrator maps to admin role; generic staff grants no roles and clearly states access needs configuration. Queue once; repeated completion is idempotent. Do not count pending invites as members or reject activation solely for pending-invite count. Preserve independent initial-admin password delivery.

## 08 — Coherence review

Run pnpm check, dedicated-DB pnpm test:integration and pnpm contract:check. Inspect test changes for weakened assertions, verify no generated files tracked, check git diff for billing or unrelated changes, and browser-check desktop/mobile/light/dark. Record exact results and residual limitations in progress.md. Never send real emails or push without explicit instruction.
