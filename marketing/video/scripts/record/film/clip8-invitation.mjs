// Clip 8: invite the accountant with a role (the "Comptable" role is prepared silently through the API).
import { openFilmWorkspace } from './common.mjs'
import { staffApi } from '../seed.mjs'
import { KARIM, ORG } from '../data.mjs'

export const meta = { id: 'clip8-invitation', snapshot: 'ch07' }
export async function prepare() {
  const w = await staffApi(ORG.slug, KARIM.email)
  const perms = await w.get('/api/v1/rbac/permissions')
  const keys = (perms.items ?? perms).map((p) => p.key ?? p)
  const read = keys.filter((k) => /^(clients|estimates|invoices|payments|reports)\.read$/.test(k))
  const role = await w.post('/api/v1/rbac/roles', {
    key: 'comptable',
    name: 'Comptable',
    description: 'Suivi des factures et encaissements',
  })
  await w.put(`/api/v1/rbac/roles/${role.id}/permissions`, { permissionKeys: read })
}
export async function run() {
  const rec = await openFilmWorkspace(meta.id, '/settings/staff/invitations/new')
  const { page } = rec
  rec.delay = 18
  rec.mv = 0.6
  await page.waitForSelector('#invite-email')
  await rec.pause(400, 'Invitation d’un nouveau membre')
  await rec.type('#invite-email', 'salma.idrissi@atlas-negoce.ma', 'E-mail de la comptable')
  await rec.click(
    page.getByText('Comptable', { exact: true }),
    'Attribution du rôle « Comptable »',
    { settle: 500 },
  )
  await rec.pause(900, 'Rôle attribué : permissions héritées')
  await rec.click(
    page.getByRole('button', { name: /Envoyer l’invitation/ }),
    'Envoi de l’invitation',
    { settle: 1500 },
  )
  await rec.pause(1500, 'Invitation envoyée')
  return rec
}
if (import.meta.url === `file://${process.argv[1]}`) {
  const rec = await run()
  await rec.finish()
}
