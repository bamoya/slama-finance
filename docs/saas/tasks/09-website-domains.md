# 09 — Implement default and verified custom website domains

Status: not started. Documentation only; no implementation is performed by this task file.

Depends on: 03, 05, 06, 08; owner-login design from 00.

[Task index](README.md) · [Approved agreement](../README.md)

## Work

- [ ] Resolve trusted normalized hosts to organizations; provide default slug subdomains and enforce globally unique domain bindings.
- [ ] Business/Pro may connect one active custom website domain per organization after DNS ownership verification and HTTPS provisioning.
- [ ] Build domain settings/status screens, verification/retry/removal API and deployment/proxy instructions. Preserve default subdomain access.
- [ ] Reject unknown/unverified hosts; revoke affected sessions on domain changes and enforce lifecycle unavailable behavior.
- [ ] Implement owner sign-in across domains only using task 00’s reviewed flow; never trust arbitrary forwarded hosts or return URLs.

## Required implementation discipline

- Preserve `api/` and `ui/`, existing domain boundaries and controller/service/repository layering. Extend public module interfaces instead of bypassing architecture rules.
- Define modular OpenAPI contracts first; regenerate API validation/types and Orval UI consumers. Do not handwrite duplicate transport schemas or generated files.
- Use new forward migrations and preserve deployed data. Reuse shared permissions, authorization, forms, tables, headers, dialogs and global theme/localization resources.
- Include meaningful unit/integration checks for changed business rules and tenant boundaries. Report changed contracts/migrations, verification and unresolved risks.

## Acceptance criteria

- [ ] Tests cover forged Host/forwarded-host headers, unverified/duplicate domains, domain removal and certificate failure states.
- [ ] Default and custom domains reach the same tenant without sharing access with another tenant.
- [ ] Essential cannot activate custom domains; public domain state reveals no private data.

## Completion evidence

Record implemented files, migration/contract changes, test commands/results and remaining blockers here when work is completed. Do not mark complete based only on scaffolding.
