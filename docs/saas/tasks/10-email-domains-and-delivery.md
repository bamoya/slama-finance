# 10 — Implement shared and custom sender identities

Status: not started. Documentation only; no implementation is performed by this task file.

Depends on: 04, 06, 08; domain-sharing policy from 00.

[Task index](README.md) · [Approved agreement](../README.md)

## Work

- [ ] Keep Resend backend credentials private. Default business sender uses the verified SaaS domain, company display name and an optional real company Reply-To.
- [ ] Business/Pro can register a sending domain through Resend, view exact DNS records, verify status and select only authorized sender identities.
- [ ] Keep website-domain and email-domain verification independent. Do not provision one SaaS email subdomain per organization by default.
- [ ] While setup is pending, use the shared sender; if an active custom identity loses verification, pause its sends and notify the owner.
- [ ] Enforce tenant authorization, quota accounting, idempotent delivery and domain ownership. Preserve existing notification preference/manual-send semantics.
- [ ] Build organization email-domain settings and actionable failure states using shared components.

## Required implementation discipline

- Preserve `api/` and `ui/`, existing domain boundaries and controller/service/repository layering. Extend public module interfaces instead of bypassing architecture rules.
- Define modular OpenAPI contracts first; regenerate API validation/types and Orval UI consumers. Do not handwrite duplicate transport schemas or generated files.
- Use new forward migrations and preserve deployed data. Reuse shared permissions, authorization, forms, tables, headers, dialogs and global theme/localization resources.
- Include meaningful unit/integration checks for changed business rules and tenant boundaries. Report changed contracts/migrations, verification and unresolved risks.

## Acceptance criteria

- [ ] Provider-adapter tests cover pending/verified/lost verification, invalid sender, domain binding and retry behavior.
- [ ] Essential business emails are blocked while security emails remain available.
- [ ] A tenant cannot send as another tenant’s domain or inspect provider secrets.
- [ ] Quota exhaustion, suspension and provider failures do not cause duplicate deliveries.

## Completion evidence

Record implemented files, migration/contract changes, test commands/results and remaining blockers here when work is completed. Do not mark complete based only on scaffolding.
