// Chapter 9: monthly report e-mail, then the owner overview across both organizations.
import { openWorkspace } from './common.mjs'
import { HOSTS, OUT, clearMailFor, mailFor, sleep } from './lib.mjs'
import { KARIM } from './data.mjs'

export async function run() {
  await clearMailFor(KARIM.email)
  const rec = await openWorkspace('ch09-rapports', '/reports/schedules')
  const { page } = rec
  await rec.pause(1200, 'Rapports planifiés : rapport mensuel de gestion', 'tbody tr, table')
  await rec.click(
    page
      .getByRole('button', { name: 'Envoyer un e-mail de test' })
      .or(page.locator('button[aria-label*="test"]'))
      .first(),
    'Envoi du rapport par e-mail',
    { settle: 900 },
  )
  const dlg = page.locator('[role=dialog] button').last()
  if (await page.locator('[role=dialog]').count())
    await rec.click(dlg, 'Confirmation de l’envoi', { settle: 1200 })
  await rec.pause(900, 'Rapport envoyé au dirigeant')
  await mailFor(KARIM.email, { subjectIncludes: '', timeout: 60000 })
  await rec.inbox(KARIM.email, { label: 'Le dirigeant reçoit le rapport par e-mail' })
  await rec.pause(2200, 'Rapport mensuel reçu par e-mail', '#mail')
  // owner overview over both organizations
  await rec.context.addCookies(
    JSON.parse((await import('node:fs')).readFileSync(`${OUT}/raw/owner.state.json`, 'utf8'))
      .cookies,
  )
  await rec.goto(`${HOSTS.owner}/`, 'Espace propriétaire : toutes les organisations')
  await page.waitForLoadState('networkidle').catch(() => {})
  await sleep(1500)
  await rec.click(page.getByText('01-11-2026 – 01-11-2026').first(), 'Choix de la période', {
    settle: 600,
  })
  const nav = page.locator('nav.rdp-nav button')
  await rec.click(nav.first(), 'Mois précédent', { settle: 250 })
  await rec.click(nav.first(), 'Mois précédent', { settle: 400 })
  await rec.click(
    page.locator('[data-day="2026-09-01"] button, button[data-day="2026-09-01"]').first(),
    'Début : 1er septembre',
    { settle: 300 },
  )
  await rec.click(nav.last(), 'Mois suivant', { settle: 400 })
  await rec.click(
    page.locator('[data-day="2026-10-31"] button, button[data-day="2026-10-31"]').first(),
    'Fin : 31 octobre',
    { settle: 300 },
  )
  await rec.click(page.getByRole('button', { name: 'Appliquer' }), 'Appliquer la période', {
    settle: 1800,
  })
  await rec.pause(2200, 'Vue consolidée des deux organisations sur septembre–octobre')
  await rec.scroll(420, 'Détail par organisation')
  await rec.pause(1500)
  return rec
}
if (import.meta.url === `file://${process.argv[1]}`) {
  const rec = await run().catch((e) => {
    console.error(e.message.split('\n')[0])
    process.exit(1)
  })
  await rec.finish()
}
