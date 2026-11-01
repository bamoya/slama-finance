# Platform domains, DNS and TLS

B-Finance serves every site from one platform domain (`PLATFORM_DOMAIN`, for example `bfinance.ma`).
See the [design](../implementation/domains/README.md).

| Host                 | Site                                           |
| -------------------- | ---------------------------------------------- |
| `bfinance.ma`        | public site                                    |
| `www.bfinance.ma`    | 301 redirect to the apex                       |
| `app.bfinance.ma`    | owner portal                                   |
| `admin.bfinance.ma`  | platform administration                        |
| `<slug>.bfinance.ma` | organization workspace (staff login and app)   |
| `api.bfinance.ma`    | API only (documentation, health, integrations) |

The browser always calls `/api/v1/*` on its own origin; there is no CORS and cookies are host-only.

## DNS

Create these records at the registrar, all pointing to the server (A, plus AAAA if used):

```text
bfinance.ma        A  <server-ip>
www                A  <server-ip>
*                  A  <server-ip>     # app, admin, api and every organization slug
```

The wildcard covers `app.`, `admin.`, `api.` and `<slug>.`. Explicit records win over the wildcard,
so existing unrelated subdomains (mail, status) keep working. A wildcard does not cover the apex,
hence the separate apex record.

## Proxy rules

Every host is sent to the **UI service** (port 8080). The UI container runs nginx
(`ui/nginx.conf`, `ui/docker/api-proxy.conf`) and applies the rules itself, so the ingress
needs no per-site configuration:

| Host             | Rule                                                                |
| ---------------- | ------------------------------------------------------------------- |
| `www.<domain>`   | 301 to `<scheme>://<domain>/<same path>`                            |
| `api.<domain>`   | `/api/*` to the API service, every other path 404                   |
| every other host | `PathPrefix(/api)` to `http://$API_UPSTREAM_HOST:3000`, else the UI |

nginx forwards the original `Host`, plus `X-Forwarded-For/Host/Proto`. The API port is never
published and the API is attached only to the private `application` and `database` networks.

### Unique service aliases

Dokploy and Coolify attach every stack's UI to one shared proxy network, and other stacks on the
same host also call their API service `api`. Docker DNS then resolves `api` to whichever stack
answers first, so requests can reach another deployment's API and fail with `UNTRUSTED_ORIGIN`.
The compose files therefore give each service a unique alias (`bfinance-postgres`, `bfinance-api`,
`bfinance-ui`, `bfinance-migrate`) and set `API_UPSTREAM_HOST=bfinance-api` on the UI, which the
UI entrypoint writes into the nginx upstream. This needs a UI image built from this change; older
images ignore the variable and keep using `api`.

### Dokploy / Traefik

The Dokploy Domains screen cannot express a wildcard host. Give the `ui` service Traefik labels
instead (or a file provider rule), for example in Dokploy's Advanced / raw Compose:

```yaml
services:
  ui:
    networks: [default, application, dokploy-network]
    labels:
      - traefik.enable=true
      - traefik.docker.network=dokploy-network
      - traefik.http.routers.bfinance.rule=Host(`bfinance.ma`) || HostRegexp(`^.+\.bfinance\.ma$$`)
      - traefik.http.routers.bfinance.entrypoints=websecure
      - traefik.http.routers.bfinance.tls=true
      - traefik.http.routers.bfinance.tls.certresolver=letsencrypt-dns
      - traefik.http.routers.bfinance.tls.domains[0].main=bfinance.ma
      - traefik.http.routers.bfinance.tls.domains[0].sans=*.bfinance.ma
      - traefik.http.services.bfinance.loadbalancer.server.port=8080
    # plus, once: a dokploy-network entry under top-level networks (external: true)
```

If you prefer the Dokploy Domains screen, add `bfinance.ma`, `www.`, `app.`, `admin.`, `api.`
(and every slug by hand) all with service `ui`, port `8080`. This does not scale; use the labels.

### Coolify

Assign every host to the `ui` service on port 8080 (comma-separated domains, for example
`https://bfinance.ma,https://www.bfinance.ma,https://app.bfinance.ma,https://admin.bfinance.ma,https://api.bfinance.ma`).
Coolify has no wildcard field in the domain list; add a Traefik wildcard router through a custom
label as above, or keep a wildcard dynamic file in `/data/coolify/proxy/dynamic/`. Never assign the
API service a domain.

## Wildcard TLS (Let's Encrypt DNS-01)

A wildcard certificate cannot use HTTP-01; the proxy needs DNS-01 with an API token for the DNS
provider (Cloudflare shown). Static Traefik configuration:

```yaml
certificatesResolvers:
  letsencrypt-dns:
    acme:
      email: ops@bfinance.ma
      storage: /letsencrypt/acme.json
      dnsChallenge:
        provider: cloudflare
        resolvers: ['1.1.1.1:53', '8.8.8.8:53']
```

Give the Traefik container `CF_DNS_API_TOKEN` (a token limited to Zone:DNS:Edit on this zone).
Use another provider's name and variables from the Traefik ACME documentation if DNS is hosted
elsewhere. The label example above requests one certificate for `bfinance.ma` and `*.bfinance.ma`,
which also covers `www.`. Keep `acme.json` on a persistent volume (mode 600) and back it up.

## Environment

| Variable                 | Service | Production                            | Purpose                                                       |
| ------------------------ | ------- | ------------------------------------- | ------------------------------------------------------------- |
| `PLATFORM_DOMAIN`        | API, UI | `bfinance.ma`                         | Platform domain; no scheme, may include a port in development |
| `PLATFORM_SCHEME`        | API     | `https`                               | `https` required in production; sets the cookie `secure` flag |
| `TRUST_PROXY_IPS`        | API     | see below                             | Exact proxy IPs whose `X-Forwarded-*` headers are trusted     |
| `PASSWORD_RESET_URL`     | API     | `https://app.<domain>/reset-password` | Set by the compose files from the two variables above         |
| `PUBLIC_CONTACT_EMAIL`   | UI      | optional                              | Shown on the public site                                      |
| `PUBLIC_WHATSAPP_NUMBER` | UI      | optional                              | Shown on the public site                                      |

`API_BASE_URL`, `CORS_ORIGIN`, `OWNER_PORTAL_ORIGIN` and `PUBLIC_ORIGIN` no longer exist; remove
them from Dokploy/Coolify. The UI reads `PLATFORM_DOMAIN` at container start into `/config.js`;
changing it needs a container recreate, not an image rebuild.

### TRUST_PROXY_IPS

The API trusts `X-Forwarded-*` only from the listed addresses. The path is
ingress (Traefik) -> UI nginx -> API, so list **both** hops as exact IPs:

- the UI container: `UI_PROXY_IP` (fixed in the compose files inside `APPLICATION_SUBNET`);
- the ingress address as seen by the UI container: run `docker network inspect <network>` for the
  network shared by Traefik and the UI (`dokploy-network` or the Coolify network) and take the
  Traefik container IP, or read it from the UI nginx access log.

Example: `TRUST_PROXY_IPS=172.30.85.2,172.18.0.5`. Leave it empty until verified: forwarded
addresses are then ignored (all clients share the proxy IP rate-limit bucket) but site resolution
still works because nginx forwards the original `Host`. Recheck after the proxy is recreated.
Make sure the public ingress overwrites inbound `X-Forwarded-*` headers.

## Verification checklist

Replace `bfinance.ma` and use `-k` only with staging certificates. `acme` is any existing slug.

```sh
D=bfinance.ma
for h in $D app.$D admin.$D acme.$D; do
  echo "== $h"; curl -sS -H "Host: $h" https://$h/api/v1/public/site; echo
done
curl -sSI https://www.$D/some/path | grep -i '^HTTP\|^location'   # 301 -> https://bfinance.ma/some/path
curl -sS https://api.$D/api/v1/health                              # {"status":"ok"}
curl -sSI https://api.$D/ | head -1                                # 404 (API only)
curl -sSI https://$D/api/v1/health | head -1                       # 200, same origin as the UI
curl -sSI https://nosuchslug.$D/api/v1/public/site | head -1      # unknown organization, no data
```

- [ ] `/api/v1/public/site` returns a different site kind for apex, `app.`, `admin.` and `acme.`.
- [ ] The certificate is valid for `bfinance.ma` and a random `*.bfinance.ma` host.
- [ ] `https://<API server IP>:3000` is unreachable from the internet.
- [ ] Log in on `acme.` and confirm the cookie is host-only (no `Domain`) and `Secure`.
- [ ] Two clients behind the proxy get separate login rate-limit buckets (`TRUST_PROXY_IPS` set).
- [ ] A forged `X-Forwarded-Host` sent straight to the public URL does not change the site.

## Staging example

Use a sub-zone so production DNS stays untouched: `PLATFORM_DOMAIN=staging.bfinance.ma`.

```text
staging            A  <staging-ip>
www.staging        A  <staging-ip>
*.staging          A  <staging-ip>
```

Sites become `staging.bfinance.ma`, `app.staging.bfinance.ma`, `admin.staging.bfinance.ma`,
`<slug>.staging.bfinance.ma`, `api.staging.bfinance.ma`. Request a certificate for
`staging.bfinance.ma` and `*.staging.bfinance.ma`. Production keeps `*.bfinance.ma`; the organization `staging` would also resolve to `staging.bfinance.ma`,
so do not create an organization with that slug in production. Use Let's Encrypt staging
(`caServer: https://acme-staging-v02.api.letsencrypt.org/directory`) for the first attempt.

## Known limits (phase 1)

- Owners cannot sign in to a workspace from `app.` yet; they must sign in as staff on `<slug>.`.
- Custom customer domains are phase 2.
