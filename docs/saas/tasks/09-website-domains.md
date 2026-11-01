# 09 — Implement default and verified custom website domains

Status: In progress. Phase 1 (default platform subdomains) is implemented; phase 2 (custom domains) is not started.

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

Phase 1 (default host-based sites), commits `f8a376f..HEAD` (see `git log`):

- `697d551` API resolves platform sites (apex, `app.`, `admin.`, `api.`, `<slug>.`) from the trusted request host.
- `734cd49` UI reads `platformDomain` at runtime and calls the API on the current origin.
- `a2540e0` UI selects the site from the host with one route tree per site.
- `945f189` UI redirects legacy path-based addresses and former organization hosts.
- `33c2258`, `51583d0`, `f4eab45`, `a8fd55c` owner-chosen organization addresses with live availability check, admin renames with slug history, legacy address lookup.
- Deployment: UI nginx routes `/api` to the API, `api.` to the API only and `www.` to the apex; compose files use `PLATFORM_DOMAIN`/`PLATFORM_SCHEME`; guide in `docs/deployment/domains-and-tls.md`; local setup in `docs/implementation/local-development.md`.

Open items:

- [ ] Custom domains (phase 2): DNS verification, certificate issuance, settings screens, session revocation on change.
- [ ] Owner single sign-on into workspaces. Until then owners sign in as staff on `<slug>.<domain>`.
- [ ] Real-service end-to-end run over `*.localhost` and a staging deployment with the verification checklist.

Do not mark complete based only on scaffolding.
