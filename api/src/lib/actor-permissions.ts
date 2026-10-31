import { sql } from 'drizzle-orm'

import type { Database, Transaction } from './db.js'
import { AppError } from './errors.js'
export async function actorPermissionKeys(
  tx: Database | Transaction,
  actor: string,
  organizationId?: string,
) {
  const scope = organizationId
    ? sql`${organizationId}::uuid`
    : sql`nullif(current_setting('app.organization_id',true),'')::uuid`
  const rows = await tx.execute(sql`select p.key from permissions p where exists(
    select 1 from actors a join organizations o on o.id=${scope}
    left join users u on u.id=a.staff_id
    where a.id=${actor}::uuid and o.activated_at is not null and o.paused_at is null and o.suspended_at is null and o.deletion_requested_at is null
    and not exists(select 1 from platform_users pu where pu.id=o.owner_id and (pu.blocked_at is not null or pu.deletion_requested_at is not null))
    and ((a.kind='staff' and u.organization_id=o.id and u.disabled_at is null and u.archived_at is null and u.deleted_at is null and not u.must_change_password
      and exists(select 1 from user_roles ur join role_permissions rp on rp.role_id=ur.role_id where ur.user_id=u.id and rp.permission_id=p.id)))
  ) order by p.key`)
  return rows.map((row) => String(row.key))
}
export async function requireActorPermission(tx: Transaction, actor: string, permission: string) {
  await tx.execute(sql`select pg_advisory_xact_lock(73619001)`)
  if (!(await actorPermissionKeys(tx, actor)).includes(permission))
    throw new AppError(403, 'FORBIDDEN', 'Your permissions have changed.')
}
