# Deployment and operations

## Chosen hosting model

The initial production deployment uses Oracle Cloud Infrastructure (OCI) Always
Free resources. The expected workload is at most 200 invoices per month, so a
single low-traffic deployment is sufficient for launch.

```text
Internet
   |
   v
OCI Always Free ARM64 VM
|- Nginx                    # TLS termination and reverse proxy
|- UI                       # Static production build
|- API                      # Node.js / Fastify container
|- PostgreSQL               # Primary transactional database
`- Redis                    # Job queue and transient state

OCI Object Storage          # Issued PDF/XML artifacts
Cloudflare R2               # Independent encrypted database backups
```

The VM runs the production Compose stack. It is deliberately a single-node
deployment: availability is appropriate for the initial business scale, but it
is not high availability.

Each application owns its container build definition:

```text
api/Dockerfile
ui/Dockerfile
docker-compose.yml          # Root-level local and single-host orchestration
```

## OCI Always Free allocation

The deployment must remain within OCI's Always Free limits in the tenancy home
region:

| Resource | Allocated to this project |
| --- | --- |
| Compute | One ARM64 Ampere A1 VM, up to 2 OCPUs and 12 GB RAM total |
| Block storage | 50–100 GB boot volume, within the 200 GB allowance |
| Object storage | Issued invoice artifacts, within the 20 GB allowance |
| Network egress | Expected to remain far below the 10 TB/month allowance |

The ARM64 architecture is a deployment constraint. Every production container
image and any native Node.js dependency must support `linux/arm64`.

OCI may reclaim an idle Always Free instance and Always Free capacity is not
guaranteed to be available in every region. The VM must therefore be treated as
replaceable infrastructure, not as the sole copy of financial data.

Sources: [OCI Always Free resources](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm) and [OCI Free Tier](https://docs.oracle.com/iaas/Content/FreeTier/freetier.htm).

## Data protection and recovery

The system must follow this recovery model from its first production release:

```text
PostgreSQL on OCI VM
   |
   `-- daily encrypted logical backup --> Cloudflare R2

Issued PDF/XML
   |
   `-- OCI Object Storage

Deployment configuration
   |
   `-- version-controlled repository + encrypted production secrets store
```

Required controls:

- Upload generated invoice PDF/XML artifacts to object storage immediately when
  an invoice is issued.
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

At the expected volume, OCI's selected compute, block-storage, object-storage,
and network allocations are within Always Free limits. Cloudflare R2 is also
expected to remain in its free tier.

| Cost item | Expected annual cost |
| --- | ---: |
| OCI Always Free infrastructure | $0 |
| Cloudflare R2 backup storage | $0 at expected usage |
| Domain name | approximately $10–$20 |
| **Expected infrastructure total** | **approximately $10–$20/year** |

This estimate excludes e-invoicing-provider fees, transactional email, payment
processing, SMS, and any paid support. It also depends on continued compliance
with free-tier limits; a budget alert and periodic OCI usage review are
required.
