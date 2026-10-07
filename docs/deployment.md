# Deployment and operations

## Chosen hosting model

**Current development selection:** Lightsail `small_3_0`, 2 vCPU / 2 GB / 60 GB,
USD 12/month base, with Coolify. Apply the low-memory
`infra/compose/docker-compose.lightsail-dev.yml` overlay after the production
Compose. Only one private, unversioned S3 media bucket is planned; no backup
bucket, snapshots or backup schedules. Test data only. S3/taxes are additional.
This supersedes the earlier 8-GB launch target below, not production requirements.

**2026-10-06 update:** AWS Lightsail is the selected replacement after OCI A1
capacity failures. Start with [the AWS runbook](../infra/aws/README.md): one AMD64
2-vCPU / 8-GB host, static IP and private S3 buckets. No AWS provisioning has yet
been verified. CI supports AMD64 and ARM64; shared Compose remains provider-neutral.
The OCI sections below are retained as historical/fallback instructions, not the
current launch target. Do not apply their data-disk mount instructions to Lightsail.

The approved launch topology is **one OCI instance** hosting Coolify and the
application. Use the full confirmed tenancy allocation (planning target: 2 A1
OCPUs / 12 GB RAM); verify eligibility and regional capacity before provisioning.
Images are built in CI, not on this production host. There is no second control
plane or database instance at launch.

Start with the [single-instance setup](deployment/single-instance.md),
[release procedure](deployment/release-procedure.md), and
[backup/recovery checklist](deployment/backup-and-recovery.md).
The versioned production stack is `infra/compose/docker-compose.production.yml`; the existing
`infra/compose/docker-compose.yml` remains local development only. Preparation is not a live
deployment: first-administrator provisioning and least-privilege database setup
remain explicit release gates.

Queue-design update: the approved MVP uses PostgreSQL-backed jobs and a worker
from the API codebase, not Redis/BullMQ. Root Compose is currently a local scaffold;
production environment, privileges and recovery are release gates. The cost/free-tier
figures below are historical planning assumptions and must be rechecked before purchase
or provisioning; this foundation implementation does not validate cloud allocations.

The initial production deployment uses Oracle Cloud Infrastructure (OCI) Always
Free resources. The expected workload is at most 200 invoices per month, so a
single low-traffic deployment is sufficient for launch.

```text
Internet
   |
   v
OCI Always Free ARM64 VM
|- Coolify + ingress proxy  # Control plane and TLS termination
|- UI                       # Static production build
|- API                      # Fastify + in-process PostgreSQL-backed job loops
`- PostgreSQL               # Primary transactional database, external named volume

OCI Object Storage          # Private media and generated document/report artifacts
Cloudflare R2               # Independent encrypted database backups
```

The VM runs the production Compose stack. It is deliberately a single-node
deployment: availability is appropriate for the initial business scale, but it
is not high availability.

Each application owns its container build definition:

```text
api/Dockerfile
ui/Dockerfile
infra/compose/docker-compose.yml            # Local development orchestration
infra/compose/docker-compose.production.yml # Pull-only production application stack
```

## OCI Always Free allocation

The deployment must remain within OCI's Always Free limits in the tenancy home
region:

| Resource       | Allocated to this project                                 |
| -------------- | --------------------------------------------------------- |
| Compute        | One ARM64 Ampere A1 VM, up to 2 OCPUs and 12 GB RAM total |
| Block storage  | 50–100 GB boot volume, within the 200 GB allowance        |
| Object storage | Issued invoice artifacts, within the 20 GB allowance      |
| Network egress | Expected to remain far below the 10 TB/month allowance    |

The ARM64 architecture is a deployment constraint. Every production container
image and any native Node.js dependency must support `linux/arm64`.

OCI may reclaim an idle Always Free instance and Always Free capacity is not
guaranteed to be available in every region. The VM must therefore be treated as
replaceable infrastructure, not as the sole copy of financial data.

Sources: [OCI Always Free resources](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm) and [OCI Free Tier](https://docs.oracle.com/iaas/Content/FreeTier/freetier.htm).

## Data protection and recovery

### Reporting and delivery runtime

The API currently hosts polling loops for PDF preparation, notification preparation
and delivery, report schedules, reminders and estimate expiry. Database leases and
claim tokens coordinate multiple API instances; do not deploy an additional legacy
Redis/BullMQ consumer. Tests disable polling and invoke workers explicitly.

Local development defaults to `NOTIFICATION_TRANSPORT=recording`: messages are
recorded without calling an email provider. Production requires Resend credentials,
a verified `EMAIL_FROM`, the trusted password-reset URL and HTTPS origins. Recording
transport is rejected in production. Configure sender policies before enabling any
of the five notification rules; all are disabled initially. A rule test addresses
only the authenticated operator, not a customer.

`NOTIFICATION_WORKER_ENABLED=false` pauses notification preparation/delivery.
`NOTIFICATION_POLL_MS` and `REPORT_POLL_MS` set polling intervals. Report scheduling
and estimate expiry continue independently. `NOTIFICATION_PAYLOAD_RETENTION_DAYS=0`
means no automatic erasure; a positive value erases terminal delivery payloads,
not issued documents or attachment references. See the
[delivery runbook](implementation/notification-delivery-status.md) for retry limits,
uncertain provider outcomes and cancellation limits.

Report downloads remain authenticated. Scheduled emails attach the selected PDF,
Excel or both outputs and link back to the application. Role changes can revoke
application access and cancel queued notices, but cannot recall already delivered
attachments. Monitor failed report runs, preparation failures, delivery
failures and object-storage capacity as separate operational signals. No production
sender verification, external delivery test or cloud deployment is implied by local
test success.

### Container and ingress configuration

The UI image serves SPA deep links and proxies `/v1/` to `api:3000` on its private
container network. Its production API base defaults to the same origin; an explicit
`VITE_API_BASE_URL` build argument can override this. Local development retains
`http://localhost:3000` unless configured otherwise. Terminate HTTPS at the ingress.

Set `TRUST_PROXY_IPS` to the comma-separated exact IPs of trusted reverse proxies
only. The safe default is empty (forwarded IPs ignored). Restrict direct API access,
overwrite forwarded headers at the public ingress, and verify distinct client rate
limits after deployment. Do not trust arbitrary client-supplied forwarding headers.

Production startup requires complete private S3-compatible storage configuration
in addition to database, HTTPS origins and Resend settings. The API runtime runs as
the unprivileged Node user. Environment secret files are excluded from image build
contexts. Apply migrations using the release checkout/tooling before starting the
runtime image; the runtime does not automatically migrate the database.

### Backup requirements

The system must follow this recovery model from its first production release:

```text
PostgreSQL on OCI VM
   |
   `-- daily encrypted logical backup --> Cloudflare R2

Generated PDFs, report exports and uploaded media
   |
   `-- OCI Object Storage

Deployment configuration
   |
   `-- version-controlled repository + encrypted production secrets store
```

Required controls:

- Store generated PDF/report artifacts and uploaded media in private object storage.
  Business snapshots are frozen on issue; PDFs are generated on demand and can be
  regenerated. XML export is not part of the implemented delivery.
- Back up private objects independently as well as the database; a database dump
  alone cannot recover logos, signatures or retained files after bucket loss.
- Create an encrypted PostgreSQL backup every day, outside OCI, and alert when
  a backup fails.
- Retain a weekly backup copy for a longer recovery window.
- Test restoration to a temporary environment at least quarterly.
- Keep production secrets out of Git and rotate them when access changes.

The target recovery posture is an RPO of at most 24 hours and an RTO of two to
four hours. A recovered system is rebuilt on a new VM from the Compose
configuration, then restored from the external database backup and object
storage.

Cloudflare R2 is selected as the independent backup destination because its
free tier covers 10 GB-month of standard storage and the forecasted invoice
volume is below that threshold. [Cloudflare R2 pricing](https://developers.cloudflare.com/r2/pricing/)

## Expected cost

The figures below are historical planning estimates, not a confirmed quote.
Check the tenancy's actual limits, capacity, current provider pricing and all
control-plane/application usage before provisioning. No zero-cost guarantee is
made by this deployment scaffold.

| Cost item                         |           Expected annual cost |
| --------------------------------- | -----------------------------: |
| OCI Always Free infrastructure    |                             $0 |
| Cloudflare R2 backup storage      |           $0 at expected usage |
| Domain name                       |          approximately $10–$20 |
| **Expected infrastructure total** | **approximately $10–$20/year** |

This estimate excludes e-invoicing-provider fees, transactional email, payment
processing, SMS, and any paid support. It also depends on continued compliance
with free-tier limits; a budget alert and periodic OCI usage review are
required.

## Local notification inbox

Business notifications (document sends and scheduled reports) can be captured by
Mailpit without contacting real recipients. Set in `api/.env`:

```dotenv
NOTIFICATION_TRANSPORT=smtp
SMTP_HOST=127.0.0.1
SMTP_PORT=1025
NOTIFICATION_WORKER_ENABLED=true
```

Run `docker compose -f infra/compose/docker-compose.yml up -d mailpit` from the repository root and restart the API after changing environment
variables. Open `http://localhost:8025` to inspect emails and attachments. Both
Mailpit ports are bound to localhost. If the API runs inside Compose, use
`SMTP_HOST=mailpit` instead.

`recording` is a test adapter, not an inbox: it simulates delivery. Previously
recorded messages are not resent when switching transports. SMTP has no provider
idempotency guarantee, so the existing worker avoids automatic retries after
ambiguous delivery failures. This adapter is restricted to local Mailpit hosts
and is rejected in production; production continues to use Resend.

Password recovery still uses its separately configured Resend adapter; this local
setting applies to the business notification queue.
