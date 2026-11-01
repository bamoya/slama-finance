// Existing team member + a seeded sales role (ch08 shows inviting an accountant).
import { staffApi } from './seed.mjs'
import { KARIM, ORG } from './data.mjs'
export async function seedTeam() {
  const w = await staffApi(ORG.slug, KARIM.email)
  const perms = await w.get('/api/v1/rbac/permissions')
  const keys = (perms.items ?? perms).map((p) => p.key ?? p)
  const sales = keys.filter((k) =>
    /^(clients|products|categories|estimates|invoices|payments|delivery_notes)\.(read|create|update)$/.test(
      k,
    ),
  )
  const role = await w.post('/api/v1/rbac/roles', {
    key: 'commercial',
    name: 'Commercial',
    description: 'Clients, devis, factures et paiements',
  })
  await w.put(`/api/v1/rbac/roles/${role.id}/permissions`, { permissionKeys: sales })
  await w.post('/api/v1/staff', {
    email: 'nadia.chraibi@atlas-negoce.ma',
    firstName: 'Nadia',
    lastName: 'Chraibi',
    roleIds: [role.id],
  })
  console.log('team seeded', sales.length, 'permissions')
}
if (import.meta.url === `file://${process.argv[1]}`) await seedTeam()
