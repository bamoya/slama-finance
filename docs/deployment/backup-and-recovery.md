# Backup and recovery release checklist

These controls must be configured by the operator; adding Compose does not enable
backups. Do not mark launch ready until a restore rehearsal succeeds.

## What to protect

| Data                         | Required copy                                                        |
| ---------------------------- | -------------------------------------------------------------------- |
| Application PostgreSQL       | Daily engine-aware logical dump, encrypted off-server                |
| Media and retained artifacts | Independent private-object backup with retention                     |
| Coolify                      | Configuration database plus installation encryption key/secrets      |
| Deployment                   | Git commit/image digests, network/domain settings, encrypted secrets |

The established off-provider backup target is Cloudflare R2; confirm it before
enabling uploads. An OCI backup bucket may be an additional copy but is not the
same protection against losing the OCI account. Separate database and media access
credentials from backup credentials and keep decryption keys outside the VM.

## Scheduling and verification

- Use PostgreSQL-aware `pg_dump`/`pg_restore`, not a live filesystem copy of PGDATA.
- Configure a supported Coolify Compose-database backup integration or an explicit
  host scheduler after checking the installed version. A Compose service does not
  automatically inherit standalone-database backups.
- Encrypt before off-server upload; set retention (initial target: 7 daily and
  4 weekly copies), and size the storage budget from measured compressed backups.
- Alert independently on failure **and missing/stale backups**. Coolify on this
  host cannot report its own total outage reliably.
- Verify checksums and record successful restore tests. Quarterly restore tests
  are the minimum target, and always rehearse before first production launch.

## Restore rehearsal

1. Use a separate, explicitly named disposable database/volume; never the live one.
2. Restore schema and data with matching PostgreSQL tooling, then reapply reviewed
   runtime-role grants and run the application at a compatible image version.
3. Restore media into a separate private test bucket and point the test environment
   at it. Verify logo/signature access, documents, payments and report downloads.
4. Disable/restrict outbound delivery in the isolated test environment so restored
   queue rows cannot email clients. Production rejects recording transport; use
   an isolated test configuration, not real production email credentials.
5. Check login, permissions, issued document immutability and record totals.
6. Measure recovery time and data age. Target RPO <=24 hours and RTO 2–4 hours;
   these are objectives, not guarantees until demonstrated.

For a real incident, preserve damaged storage when practical, rebuild the VM and
Coolify, restore the database and objects, validate privately, then switch DNS or
ingress. Reconcile queued/uncertain email outcomes before restarting delivery.
