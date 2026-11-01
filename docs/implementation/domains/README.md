# Platform domains — phase 1 plan (task 09)

Status: phase 1 implemented (steps 1-7); the real-service end-to-end run (step 8) is pending.
Phase 2 (custom domains for Business/Pro) follows separately.

Guides: [domains, DNS and TLS](../../deployment/domains-and-tls.md) ·
[local development](../local-development.md) · [Dokploy startup](../../deployment/dokploy-startup.md)

## Goal

Replace path-based organization URLs (`/organizations/<uuid>/...`) and the separate
`api-…` origin with host-based sites on one platform domain:

```text
bfinance.ma                    public site (www. redirects here)
app.bfinance.ma                owner portal
admin.bfinance.ma              platform administration
<slug>.bfinance.ma             organization workspace (staff login + app)
api.bfinance.ma                API for non-browser use (docs, health, future integrations)

Every site:  /api/v1/*  -> API      everything else -> UI
```

The browser always calls the API on its own origin. Cookies stay host-only, so a session
created on one site is never sent to another site. No browser CORS is needed.

## Configuration

All hosts derive from environment variables; nothing is hard-coded.

| Variable                   | Production              | Development      |
| -------------------------- | ----------------------- | ---------------- |
| `PLATFORM_DOMAIN`          | `bfinance.ma`           | `localhost:5173` |
| `PLATFORM_SCHEME`          | `https`                 | `http`           |
| `TRUST_PROXY_IPS` (exists) | proxy network/container | empty            |

Derived: `app.`, `admin.`, `api.`, `<slug>.` origins, email links, reserved names, cookie
`secure` flag. Replaces `OWNER_PORTAL_ORIGIN` and `CORS_ORIGIN` for browser traffic.
The UI receives `platformDomain` through runtime `config.js` (one build for every environment);
`apiBaseUrl` becomes the relative `/api`.

## Host resolution (API)

A single resolver classifies the trusted request host (Fastify `trustProxy` only for
`TRUST_PROXY_IPS`; otherwise the socket host):

| Host                  | Kind         | Allowed route groups                                             |
| --------------------- | ------------ | ---------------------------------------------------------------- |
| `bfinance.ma`, `www.` | public       | public marketing/contact endpoints, owner registration redirects |
| `app.`                | owner        | `/api/v1/owner/*`, `/api/v1/owner-auth/*`                        |
| `admin.`              | admin        | `/api/v1/admin/*`                                                |
| `api.`                | api          | health, docs, future token-based API; no cookie auth             |
| `<slug>.`             | organization | organization auth and business routes                            |
| anything else         | unknown      | 404 for everything except health                                 |

- The organization comes from the host slug, replacing the `X-Organization-Id` header and
  the `/organizations/:id` URL segment. A request whose route group does not match its host
  kind returns 404 (no information leak).
- Unknown, reserved, deleted or unavailable slugs never expose organization data; lifecycle
  rules (suspended/blocked/deleting) keep returning `ORGANIZATION_SUSPENDED`.
- Reserved slugs: `app`, `admin`, `api`, `www`, `mail`, `static`, `assets`, `status`, `docs`,
  `help`, `support`, `billing`, `auth` (+ anything starting with `xn--`). Enforced at
  creation (API validation) and by a database check.
- Cookie names stay as today; cookies are host-only (no `Domain` attribute), `SameSite=Lax`
  (admin `Strict`), `Secure` when `PLATFORM_SCHEME=https`.

## API changes

1. Prefix every route with `/api/v1` (OpenAPI `servers`, route registration, generated
   clients, tests). One mechanical commit.
2. Host resolver plugin + per-group host guard; replace `require-portal-origin` and the
   `X-Organization-Id` tenant header with host-derived scope.
3. Slug rules: reserved list, lowercase `a-z0-9-`, 3–40 chars; uniqueness already exists.
   Admin-only slug change with `organization_slug_history` (old slug → organization) so old
   addresses redirect; audited; revokes the organization's sessions.
4. Public lookup for legacy links: `GET /api/v1/public/organizations/{id}/address` returns only
   the current slug for active organizations (used by old `/organizations/<uuid>/…` links).
5. Email links built from `PLATFORM_DOMAIN`: owner emails → `app.`, organization staff emails
   → `<slug>.`, admin nothing.
6. Remove the `CORS_ORIGIN`/`OWNER_PORTAL_ORIGIN` browser requirements; keep CORS disabled
   for cookie routes.

## UI changes

1. Host-based app selection at startup (`public`, `owner`, `admin`, `organization`), each with
   its own route tree; code for the other trees is lazy-loaded so `admin` code is only fetched
   on `admin.`.
2. Paths drop their prefixes: organization `/login`, `/workspace/...`; owner `/`,
   `/organizations`, `/subscription`; admin `/`, `/payments`, `/customers`, ….
3. Cross-site links (owner → organization login, public → app signup) are built from
   `platformDomain`.
4. Legacy redirects: `/organizations/<uuid>/…` on any host → lookup → `https://<slug>.<domain>/…`;
   `/admin/*` and `/owner/*` on the public host → `admin.` / `app.`.
5. HTTP client: base `/api`, drop the `X-Organization-Id` header and path-derived workspace
   scope.

## Local development

- Open `http://app.localhost:5173`, `http://admin.localhost:5173`,
  `http://<slug>.localhost:5173`, `http://localhost:5173` (public).
- Vite proxies `/api` to `http://localhost:3000` preserving the `Host` header;
  `server.allowedHosts: ['.localhost']`.
- Chrome and Firefox resolve `*.localhost` natively; Safari may need `/etc/hosts` entries
  (documented in `local-development.md`).
- Integration tests set the `Host` header explicitly per site.

## Deployment

- DNS: `bfinance.ma`, `www`, and wildcard `*.bfinance.ma` → server.
- TLS: wildcard certificate via Let's Encrypt DNS-01 on the proxy (Traefik/Dokploy).
- Proxy rule for every host: `PathPrefix(/api)` → API service, everything else → UI service;
  `api.bfinance.ma` → API only; `www.` → 301 to the apex. Implemented in the UI container's
  nginx (`ui/nginx.conf`), so the ingress only forwards every host to the UI; compose files
  and `docs/deployment/domains-and-tls.md` are updated.
- The proxy overwrites `X-Forwarded-*`; the API trusts them only from `TRUST_PROXY_IPS`, and
  the API port is not published publicly.

## Delivery (small commits)

| Step | Owner            | Content                                                                                           |
| ---- | ---------------- | ------------------------------------------------------------------------------------------------- |
| 1    | API agent        | `/api/v1` prefix (contracts, routes, tests)                                                       |
| 2    | API agent        | config (`PLATFORM_DOMAIN`, `PLATFORM_SCHEME`), host resolver, host guards, tenant scope from host |
| 3    | API agent        | slug rules, reserved names, slug history + admin rename, legacy lookup, email links               |
| 4    | UI agent         | config, HTTP client base `/api`, Vite proxy/hosts                                                 |
| 5    | UI agent         | host-based app selection, route trees without prefixes, cross-site links                          |
| 6    | UI agent         | legacy redirects, admin slug rename UI                                                            |
| 7    | Docs/infra agent | nginx/compose/Traefik rules, DNS/TLS guide, local-development guide                               |
| 8    | E2E agent        | real-service run over `*.localhost` (owner → org → admin flows, isolation checks)                 |

Steps 1–3 and 4–6 run in parallel once step 1's contract prefix is merged.

## Tests

- Host classification table (unit), including spoofed `X-Forwarded-Host` from untrusted IPs.
- Route group vs host kind: every cross-kind call returns 404.
- Cookie isolation: a session from `a.` is rejected on `b.`, `app.`, `admin.`.
- Reserved and invalid slugs rejected; slug rename keeps old address redirecting and revokes
  sessions.
- Legacy UUID links redirect; unknown UUIDs do not leak existence beyond a generic page.
- Lifecycle restrictions still enforced through host-resolved organizations.

## Out of scope (phase 2)

Custom domains for Business/Pro (DNS verification, certificate issuance, settings screens,
session revocation on change), owner single sign-on across sites.
