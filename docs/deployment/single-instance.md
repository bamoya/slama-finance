# Single-instance OCI + Coolify

## Topology and ownership

One ARM64 Linux instance runs Coolify, its own internal services and ingress,
plus the finance stack. Coolify's internal PostgreSQL/Redis are not application
databases. The application uses PostgreSQL-backed jobs inside the API process;
do not deploy a Redis service or a second copy of the API as a supposed worker.

```text
Internet -> HTTPS ingress (Coolify) -> UI nginx -> API
                                                 |
                                             PostgreSQL
API -> private OCI Object Storage / Resend
Database and media -> independent off-server backups
CI -> GHCR images -> Coolify pulls an approved commit
```

Start with the full eligible allocation, targeted at 2 A1 OCPUs / 12 GB RAM.
This is conditional on actual tenancy limits and availability. Reserve RAM and CPU
for Linux, Coolify and its internal database, proxy and monitoring. Production
Compose limits are initial safeguards, not reservations or performance promises.
Observe normal traffic, PDF generation, scheduled reports and backups together
before tuning. Never build images on this host.

## OCI preparation

The versioned OCI definitions live in [`infra/oci`](../../infra/oci/README.md).
Follow its plan/review workflow first; it provisions the infrastructure but does
not install Coolify, format the data disk, or release the application automatically.

1. Confirm region, Always Free eligibility, compute capacity and budget alerts.
2. Create a supported Linux ARM64 instance with SSH keys and persistent boot disk.
   Plan 50–100 GB initially; count all boot/block volumes against the allowance.
3. Restrict SSH to operator IPs or a VPN. Allow public 80/443 for application
   ingress. Do not expose 5432, 6379, 3000 or Docker's API publicly. OCI security
   rules and the host firewall must both enforce the intended access.
4. Install Coolify from its official instructions on the fresh server. Secure the
   first administrator immediately, enable MFA and restrict dashboard access.
   Back up Coolify's database **and installation encryption secrets** separately.
5. Configure private OCI Object Storage, least-privilege access credentials and
   retention/capacity alerts. Use the region-specific S3-compatible endpoint.
6. Prepare independent backup storage; the established target is encrypted
   Cloudflare R2 copies. Confirm credentials, retention and pricing before use.

## Add the application

- Add a Docker Compose resource pointing to `infra/compose/docker-compose.production.yml`.
- Use a stable project/resource identity. Do not import the local Compose file.
- Copy the documented placeholders from `.env.production.example` into Coolify's
  secret settings. Never commit real values or upload an environment file to CI.
- Set API/UI/release image references to the same immutable commit tag or digest.
  Authenticate the server to GHCR using read-only package access if images are private.
- Create the explicit external PostgreSQL Docker volume before starting the stack.
  If using a separate block disk, mount it persistently before provisioning the
  data path and verify the Docker volume actually stores data on that disk.
  A named volume alone does not place data on a separate OCI block volume.
- Assign the finance HTTPS domain to the **UI service port 80 only**. Keep API and
  PostgreSQL off the Coolify ingress network. Use the configured Coolify network
  and ensure private CIDRs do not overlap other Docker or OCI networks.
- Complete the release gates before routing users to the application.

## Trusted proxy release gate

The path is ingress -> UI nginx -> API. `TRUST_PROXY_IPS` accepts exact addresses,
not arbitrary ranges or `true`. The UI has a stable private address in Compose;
the operator must also determine and keep stable the real ingress source address.
Configure both only after confirming public ingress sanitizes forwarded headers.
Leave the setting empty until verified: this ignores forwarded headers safely,
but rate limiting then shares the UI proxy's IP bucket between users.

Before launch, verify genuine clients obtain distinct login rate-limit buckets
and forged `X-Forwarded-For` headers cannot bypass limits. Check proxy addresses
after redeployments. A direct public route to the API is not an acceptable workaround.

## Availability

This is not high availability. Host loss stops both control and data planes.
Keep recovery instructions and credentials outside this host. Coolify backups do
not include application database/media data. See the recovery checklist.

References: [Coolify installation](https://coolify.io/docs/start-with-self-hosted),
[Coolify runtime model](https://coolify.io/docs/core/how-coolify-works),
[OCI Always Free resources](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm).
