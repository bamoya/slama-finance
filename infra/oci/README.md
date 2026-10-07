# OCI infrastructure — single-instance launch

Terraform >=1.7 provisions one ARM64 Ubuntu instance for Coolify and the finance
stack. Nothing in this directory automatically applies or deploys the application.
OpenTofu may also support these definitions, but validation currently uses Terraform.

## Defined resources

- VCN, regional public subnet, internet gateway and default route.
- Explicit empty security list and an NSG: public 80/443, SSH only from your
  `admin_cidrs`. No public database, API or Coolify admin ports. Outbound traffic is
  allowed for package downloads, image pulls, OCI and Resend; tighten only with a
  tested dependency inventory. Rules are stateful.
- One `VM.Standard.A1.Flex` instance, default 2 OCPUs / 12 GB RAM, 50 GB boot disk.
- Separate 50 GB database block volume with encrypted paravirtualized attachment.
- Two private, versioned Standard buckets: application media and supplementary
  OCI backups. No public access, expiry policies or irreversible retention locks.
- Optional policies for two **existing dedicated IAM groups**. Object operations
  are scoped by bucket; bucket-metadata inspection is compartment-wide. Use a
  dedicated compartment. Backup permissions include deletion: this is not WORM.
- Minimal cloud-init: SSH key-only access, no root SSH/password login, basic tools.

Instance, database volume and buckets have `prevent_destroy`. Boot preservation
is enabled. These are Terraform safeguards, not protection from console deletion,
account loss, provider reclamation or removing resource blocks from configuration.
Version history counts toward storage limits. Defaults consume 100 GB of block
storage before other tenancy resources. Confirm all free allowances and regional
capacity; the configuration does not guarantee eligibility or a zero bill.

## Inputs and credentials

For a new dedicated compartment, set `create_compartment = true` and supply the
parent tenancy OCID as `compartment_ocid`. Terraform then creates `slama-finance`
and places resources and optional policies inside it. The compartment is protected
against destruction. The default remains reuse of an existing compartment.

The local ignored `terraform.tfvars` uses a temporary operator `/32` for bootstrap
SSH. After installing Tailscale and verifying ordinary key-based SSH through its
private address, remove public SSH ingress through a reviewed Terraform change.
Do not expose Coolify administration publicly. Tailscale installation and login
are separate post-provisioning steps; no VPN credentials are stored in Terraform.

Use an existing compartment and the `slama-finance` OCI session profile in
`~/.oci/config`. The provider defaults to `SecurityToken` authentication.
Authenticate locally before planning:

```sh
oci session authenticate --region af-casablanca-1 --profile-name slama-finance
oci session validate --profile slama-finance --auth security_token
```

Session tokens are short-lived (normally one hour). Validate before planning and
applying, and renew the session when needed. Do not use this interactive flow for
unattended deployments. Operators using an API-signing profile must explicitly set
`oci_auth = "APIKey"` and `oci_profile` to their own profile name.

Never place private keys, session tokens, application passwords or customer secret
keys in Terraform variables, cloud-init, Git or outputs.

Copy `terraform.tfvars.example` to `terraform.tfvars` and replace every placeholder:
region, compartment, exact AD, an explicit regional **Ubuntu 24.04 LTS ARM64 image
OCID compatible with A1**, public SSH key, operator IP allowlist and bucket names.
The example IP is reserved documentation space, not a usable operator address.
Use an image OCID you reviewed; no latest-image lookup silently replaces servers.
Use your tenancy home region if relying on Always Free. Choose CIDRs that do not
overlap existing VCN/VPN/Docker networks; subnet must be inside the VCN.

IAM groups are optional inputs to avoid unexpectedly creating tenancy identities.
With null defaults, no application/backup policy is created: deployment is not
ready for storage access until you provide groups or establish equivalent policies.
Create separate dedicated users/customer secret keys outside Terraform, then place
credentials in Coolify. The current API uses S3-compatible credentials, not OCI
instance principals. The Terraform operator's own provisioning permissions are a
separate concern and must cover compute, networking, volumes, buckets and optional
policies in the selected compartment.

## State and review workflow

Local state is the deliberate initial default. State and plan files are ignored
by Git but may contain sensitive metadata; use encrypted local storage, restrict
permissions, back up state securely, and allow only one operator at a time.
Before shared/team use, configure an approved encrypted remote backend with
locking. Do not assume this application backup bucket is already a state backend.
Commit `.terraform.lock.hcl` so all operators use the same provider selection.

```sh
terraform -chdir=infra/oci init
terraform -chdir=infra/oci fmt -check
terraform -chdir=infra/oci validate
terraform -chdir=infra/oci test
terraform -chdir=infra/oci plan -out=launch.tfplan
```

Tests use a mocked provider and `command = plan`; they do not access OCI.
A real plan reads OCI and needs credentials. Inspect creates, replacements, IAM
scope, region, sizes and projected billing. Applying is a separate operator decision:

```sh
terraform -chdir=infra/oci apply launch.tfplan
```

Never apply a stale/unreviewed plan. Changing immutable image/network/AD values
may require replacement, which the instance safeguard intentionally blocks.
No apply has been run while preparing this repository.

## After provisioning — required, not automatic

1. Wait for cloud-init and verify key-only SSH works as `ubuntu`. Do not open
   root SSH just to satisfy an installer; use Coolify's documented non-root/sudo
   server setup and review the privileges it requires.
2. Identify the attached volume by its OCI ID/device mapping. Confirm it is new
   and empty before any filesystem creation. Mount by filesystem UUID at a
   stable path such as `/srv/slama-postgres`; verify it survives reboot.
3. Point the external Docker volume from production Compose at that mounted
   path. Ensure mount failure blocks PostgreSQL startup (for example a reviewed
   systemd Docker dependency on `RequiresMountsFor=/srv/slama-postgres`). Do not
   let the database write into an empty boot-disk mountpoint if the disk is absent.
   Attachment is **not** formatting/mounting; the Compose named volume alone does
   not use this OCI volume automatically.
4. Install Coolify following its official instructions. Bootstrap its admin via
   restricted access/SSH tunnel; port 8000 is not publicly opened. Configure its
   HTTPS hostname and protect it with MFA/access restrictions. Public 443 can
   still expose the dashboard through hostname routing: restrict that route with
   VPN/IP access control or keep administration tunnel-only. Apply reviewed host
   firewall rules as well as OCI NSGs; account for Docker's firewall behavior.
5. Point application DNS to the output public IP. It is ephemeral; replacement
   may change it. No DNS zone or certificates are provisioned by Terraform here.
6. Follow [Coolify/app setup](../../docs/deployment/single-instance.md) and the
   [release gates](../../docs/deployment/release-procedure.md). In particular,
   production admin bootstrap and full restricted database grants remain required.
7. Configure budgets, independent uptime/backup alerts, object retention and
   off-provider encrypted backups. Buckets alone do not schedule backups.
   The OCI backup bucket supplements, not replaces, the planned independent copy.
8. Test restore of database, media and Coolify configuration before launch.

## Scope exclusions

No paid database, load balancer, NAT gateway, replication, automatic disk format,
auto-installed Coolify, app credentials, DNS, automatic backup schedule or automatic
deploy. Infrastructure provisioning and application release are separate workflows.

References: [OCI provider](https://registry.terraform.io/providers/oracle/oci/latest/docs),
[OCI volume preservation](https://docs.oracle.com/en-us/iaas/Content/dev/terraform/managing-volumes.htm),
[Coolify server setup](https://coolify.io/docs/core/infrastructure/servers/add-server).
