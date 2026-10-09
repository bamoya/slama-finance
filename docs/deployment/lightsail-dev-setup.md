# Lightsail development setup

> RETIRED: AWS Slama infrastructure was destroyed at the owner's request after
> switching to Hostinger. Lightsail instance/disk, static IP, media bucket, storage
> policy, versioned state bucket and its CloudFormation stack were deleted.
> Server disk data and remote state history cannot be recovered from these resources.
> The instructions below are historical, not a description of a live deployment.
> OCI cleanup remains pending because its CLI session expired. Remove the retired
> Tailscale device and any DNS record pointing at 51.44.43.230 separately.

## Verified 2026-10-06

- Lightsail `slama-finance`, account `054119522048`, Paris, 2 vCPU / 2 GB.
- Public IP `51.44.43.230`: only HTTP/HTTPS permitted by Lightsail firewall.
- Tailscale IP `100.118.130.26`: key-authenticated SSH verified.
- Docker and Coolify 4.3.23 installed from the official installer.
- Coolify, its PostgreSQL, Redis and realtime containers report healthy.
- Dashboard: `http://100.118.130.26:8000`, reachable through Tailscale.
- Admin ports 8000, 6001 and 6002 bind only to the Tailscale address using
  `infra/compose/docker-compose.coolify-private.yml`, installed on the host as
  `/data/coolify/source/docker-compose.custom.yml`.
- 2 GiB swap enabled persistently in `/etc/fstab`; not a replacement for RAM.
- Root SSH login and password authentication remain disabled.
- No application containers, paid backups or optional cloud services deployed.

## Pending setup

1. Owner creates the first Coolify administrator through the private dashboard.
2. Dedicated deployment SSH account `cooluser` was explicitly approved and created.
   `infra/aws/configure-coolify-user.sh` grants passwordless sudo (root-equivalent)
   and group access to Coolify data, using the existing automation key supplied
   as its argument. Private keys retain mode 600. Container-to-host SSH and sudo
   were verified successfully using the pinned host key. Non-root Coolify server
   access is experimental. In Coolify, set the local server SSH user to `cooluser`,
   retain the existing key and `host.docker.internal` address, then validate.
   Dashboard configuration/validation remains pending. Do not enable root SSH.
3. Store `/data/coolify/source/.env` securely in a password manager without
   exposing it in logs or Git. No automatic off-server backup exists.
4. Application domain: `slama-finance.bamoya.com`; point its A record at
   `51.44.43.230`. Publish reviewed API/UI/release images off-host,
   configure Resend and dedicated S3 credentials, then complete first-launch gates
   in `release-procedure.md`. Application deployment remains pending.
5. Merge production Compose with the Lightsail dev overlay, in that order. Do not
   build on this host. Monitor memory under actual report/PDF workloads.

Do not expose the Coolify dashboard through a public proxy domain. The private
bindings depend on this Tailscale IP; update them if the device identity changes.
Verify container restart and Tailscale availability after a planned reboot before
considering the setup restart-tested.
