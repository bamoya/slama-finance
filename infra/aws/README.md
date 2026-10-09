# AWS Lightsail launch

## Current selection: minimal development environment

The approved target is now **small_3_0: 2 vCPU / 2 GB / 60 GB, USD 12/month
base**, with Coolify retained. This supersedes the larger production sizing below.
Only the private media bucket and its policy are planned. `bucket_names.backups`
is omitted, `storage_versioning_enabled = false`, and no snapshots or scheduled
backups are configured. No RDS, paid monitoring add-ons, NAT gateway or load balancer.
S3 usage and applicable taxes are extra: USD 12 is not a total-bill cap.

Use test data only: deletion/overwrite has no configured recovery copy. Terraform
uses `Suspended` for versioning; on a new bucket this stores no version history.
Suspending an already versioned bucket would not delete old versions.

In Coolify use the shared production Compose followed by
`infra/compose/docker-compose.lightsail-dev.yml`. This overlay caps PostgreSQL at
256 MiB, API at 512 MiB (256 MiB JS heap), and UI at 64 MiB: **832 MiB total**,
excluding Coolify, proxy, host OS, Docker and Tailscale. These are experimental dev
limits, not a guarantee of fitting peak PDF/report memory. Run migrations with the
application stopped, not during heavy traffic. Keep CI builds off-host.

The overlay slows notification/report polling but does **not** implement a global
PDF concurrency limit; different worker loops and manual exports may overlap.
Avoid parallel exports or multiple report schedules until measured under load.
Watch host RAM, OOM/restarts, disk and Coolify's own services. Configure a modest
host swap file only after inspecting free disk; it is not created by Terraform.
No automatic backup installation or optional paid service should be enabled by
Coolify during this dev launch. Tailscale, Coolify and host tuning remain manual
post-provisioning tasks, not completed by this repository change.

Example for validating the merged configuration from the repository root:

```sh
docker compose --env-file .env.production \
  -f infra/compose/docker-compose.production.yml \
  -f infra/compose/docker-compose.lightsail-dev.yml config --quiet
```

The following larger-host and backup guidance is retained for a future production
environment, not enabled for this development deployment.

Selected replacement for the OCI A1 launch blocked by regional capacity. This is
an independent Terraform root/state: it does not import, modify or destroy OCI.
AWS resources have NOT been provisioned by adding these definitions.

## Topology and cost approval

One Ubuntu AMD64 Lightsail host runs Coolify, ingress, UI, API/background jobs,
and PostgreSQL. Target: 2 vCPU / 8 GB RAM / 160 GB disk, Linux with public IPv4.
The discussed base budget is USD 44/month; verify the live regional bundle before
planning. S3, snapshots, taxes, traffic overages and unattached static IPs can add
charges. Stopping the host is not cancellation. No RDS, NAT gateway, load balancer,
second host or separately charged data disk is created.

Paris (`eu-west-3`) is provisional. Verify account, region, blueprint, bundle,
availability zone, live price and capacity before ordering. IDs are intentionally
not guessed in the example. Configure budget alerts before launch (alerts are not
a hard spending cap).

## Authenticate and verify

The selected deployment account is now **054119522048**, a dedicated Organizations
member account. Management account **314431539508** must not host these resources.
The `slama-finance` CLI profile should assume
`arn:aws:iam::054119522048:role/OrganizationAccountAccessRole` through an authorized
management-account identity. Verify with `aws sts get-caller-identity --profile
slama-finance` before planning. Keep the account ID as a string (leading zero).
The local Terraform provider account allowlist now targets the member account.

**Historical shared-account alternative — do not attach for the selected setup:**
`deployer-policy.json` is the initial console-attached deployment policy for
account 314431539508 in Paris. Keep `storage_iam_users = null`: this policy does
not grant user/policy attachment, access-key creation or object-data access.
An administrator attaches storage policies to separate runtime identities later.
It intentionally omits server/bucket deletion. Cleanup needs separately reviewed
permissions. Static-IP operations are region-wide, not name-scoped; review this
if other Lightsail resources share the region. Tagging permission can tag other
instance resources, so tag conditions are not a strict isolation boundary against
a malicious deployer. Bucket-policy editing can indirectly delegate object access,
and IAM policy-version editing affects any identities attached to those policies.
Treat this as a trusted infrastructure operator, not an untrusted application user.
Validate with IAM Access Analyzer before attachment and with a real Terraform plan;
JSON parsing alone does not prove AWS authorization. Never broaden to admin on an
AccessDenied; inspect the exact operation and amend the narrow policy if needed.

Install AWS CLI v2 locally (on macOS: `brew install awscli`). Prefer short-lived
credentials through an existing IAM Identity Center setup if the account has one:

```sh
aws configure sso --profile slama-finance
aws sso login --profile slama-finance
aws sts get-caller-identity --profile slama-finance
aws lightsail get-regions --include-availability-zones --profile slama-finance
aws lightsail get-blueprints --region eu-west-3 --profile slama-finance
aws lightsail get-bundles --region eu-west-3 --profile slama-finance
```

Do not create root access keys or paste credentials into chat, tfvars or Git.
If Identity Center is not configured, agree on an authentication method before
continuing. Set `aws_account_id` to the STS account ID; the provider rejects a
different account. Never blindly use an existing default profile.

Copy example values into ignored `terraform.tfvars`, replace all placeholders,
and supply only the public SSH key. The user's ED25519 key is installed via a
minimal launch script instead of importing it as a Lightsail key-pair resource.
Lightsail's default regional key remains a recovery path; no private key is read,
downloaded or created in Terraform. Verify Ubuntu username and bootstrap logs.

```sh
terraform -chdir=infra/aws init
terraform -chdir=infra/aws fmt -check
terraform -chdir=infra/aws validate
terraform -chdir=infra/aws test
terraform -chdir=infra/aws plan -out=launch.tfplan
# Separate approval after reviewing account, resources and price:
terraform -chdir=infra/aws apply launch.tfplan
```

Tests are mocked plans and make no AWS calls. Commit the provider lock file.
State lives in the private, versioned S3 bucket
`slama-finance-tfstate-054119522048-eu-west-3`, key
`slama-finance/dev/terraform.tfstate`. `backend.tf` enables encryption and native
S3 locking (Terraform >= 1.10); no DynamoDB table is needed. Authenticate using
the `slama-finance` AWS profile. Never commit state, saved plans or credentials.

The bucket is independently managed by the CloudFormation stack
`slama-finance-terraform-state`, defined in `state-bucket.yaml`. It has public
access blocked, TLS-only access, SSE-S3 encryption, versioning, and retain-on-delete
protection. It is not an application backup bucket and has small S3 storage/request
charges. Do not delete its stack or bucket during application cleanup.

Bootstrap (only when the bucket does not already exist):

```sh
aws cloudformation deploy --template-file infra/aws/state-bucket.yaml \
  --stack-name slama-finance-terraform-state \
  --profile slama-finance --region eu-west-3
```

On a fresh checkout use `terraform -chdir=infra/aws init`. Migrating existing local
state requires `terraform -chdir=infra/aws init -migrate-state` instead; verify
the remote resource inventory before removing any local recovery copies.
Local migration backups remain sensitive and ignored. Old saved plans should not
be reused after migration. S3 object versions provide state recovery; restore only
after checking the current infrastructure and ensuring no operator is running Terraform.

## Access, bootstrap and deployment

Only 80/443 are public. Port 22 is temporarily scoped to the operator IPv4;
IPv6 is disabled. AWS can create initial default firewall rules before Terraform
replaces them: do not deploy workloads until the final firewall is verified.
After provisioning:

1. Verify SSH host fingerprint through a trusted console path and test the
   dedicated key. Verify cloud bootstrap completed; do not skip host verification.
2. Install Tailscale, authenticate interactively, restrict tailnet ACLs and test
   ordinary SSH over the private address. Then set `admin_cidrs = []`, review and
   apply the firewall change. Tailscale is not automatically installed or enrolled.
3. Install Coolify with reviewed non-root/sudo setup. Keep administration on the
   private network or SSH tunnel, not a public hostname behind port 443. Never
   open 8000 or the database port. Verify Docker/host firewall behavior.
4. Use the attached static IP for application DNS; keep it attached to avoid idle
   IP charges. Configure HTTPS on UI only. No domain/certificate is provisioned here.
5. Create the external PostgreSQL Docker volume deliberately on the host disk.
   Unlike OCI, there is no separate data disk to mount. Instance deletion loses
   this storage; `prevent_destroy` is only a Terraform guard, not a backup.
6. Pull matching multiarch image digests using the shared production Compose.
   Runtime limits total about 5.125 GiB, leaving room on the 8 GB host for the OS
   and Coolify. Run migrations separately and avoid builds on the host.
7. Complete the [release gates](../../docs/deployment/release-procedure.md):
   full restricted DB grants, production admin bootstrap, Resend, S3, proxy trust,
   authorization and restored-backup tests. Infrastructure alone is not launch-ready.

## S3 and backups

Two private versioned buckets use SSE-S3, blocked public access, disabled ACLs and
TLS-only access. Separate IAM policies scope media and backup operations to their
own buckets. Optional existing IAM usernames attach those policies. By default
policies exist but nobody is granted access. Do not assume this Lightsail VM has
an EC2 instance role: the current API uses explicit S3 access-key settings.
Provision dedicated credentials separately and store them as Coolify secrets;
no access keys are Terraform resources. Review each identity's other policies.

Use output S3 endpoint/region/bucket and verify upload, signed download and delete
with the existing storage adapter before launch. Backup credentials must not be
passed to the API. DeleteObject does not permanently prune version history; choose
retention, lifecycle expiry and recovery permissions deliberately. Buckets have no
automatic expiry or Object Lock and version history incurs storage charges.

Backup jobs and snapshots are NOT enabled by this scaffold. Before launch,
schedule encrypted PostgreSQL backups, define retention and alerting, configure
an independent off-account/provider copy and test restoring DB, media and Coolify.
The second bucket in the same AWS account is not protection from account loss.
Filesystem snapshots alone are not the PostgreSQL backup strategy.

## Migration boundary

The app and API contracts are unchanged. CI publishes AMD64 and ARM64 images;
the shared Compose uses generic S3 variables. Keep `infra/oci` and its state until
AWS is verified. Existing OCI buckets/network/50 GB data volume still exist and
may incur charges. OCI cleanup requires its own reviewed, approved deletion plan;
do not remove the directory/state to simulate cleanup.

References: [Lightsail bundles](https://docs.aws.amazon.com/lightsail/latest/userguide/amazon-lightsail-bundles.html),
[Terraform Lightsail](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/lightsail_instance).

# RETIRED — do not apply

AWS resources were destroyed after the move to Hostinger. The S3 backend bucket
and its version history were also deleted. Configuration is retained only as a
reference; applying it would create billable resources again. OCI cleanup is
separate and still pending authentication. Historical deployment notes follow.
