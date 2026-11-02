export const KARIM = {
  firstName: 'Karim',
  lastName: 'Benali',
  email: 'karim.benali@atlas-negoce.ma',
  password: 'Atlas#Negoce2026',
}
export const ORG = { name: 'Atlas Négoce SARL', slug: 'atlas-negoce' }
export const COMPANY = {
  legalName: 'Atlas Négoce SARL',
  email: 'contact@atlas-negoce.ma',
  phone: '+212 535 52 31 40',
  address: '24, Avenue des FAR, Zone industrielle',
  city: 'Meknès',
  ice: '002154873000041',
  rc: '18452',
  if: '40128756',
  bankName: 'Attijariwafa bank',
  rib: '007540000123456789012319',
  iban: 'MA64007540000123456789012319',
}
export const CLIENT = {
  legalName: 'Coopérative Al Baraka',
  contactName: 'Mohamed Alaoui',
  ice: '002367419000045',
  address: '12, Rue Ibn Khaldoun, Hay Salam',
  city: 'Meknès',
  email: 'contact@coop-albaraka.ma',
  phone: '+212 661 48 20 97',
}

// Scenario setting: every history date and every period picked on screen is relative to the recording date.
// 'last-3-months' = the 3 months ending today (same day 3 months back -> today).
export const DEMO_PERIOD = 'last-3-months'
const pad = (n) => String(n).padStart(2, '0')
export const isoDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export const todayDate = () => {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12)
}
export const daysFromToday = (n) => {
  const d = todayDate()
  d.setDate(d.getDate() + n)
  return isoDate(d)
}
/** Calendar days "DD-MM-YYYY" as typed in the app's date fields. */
export const frDate = (iso) => iso.split('-').reverse().join('-')
/** Period picked by clips: { start, end (ISO), monthsBack }. */
export function demoPeriod(setting = DEMO_PERIOD) {
  if (setting !== 'last-3-months') throw new Error(`unknown DEMO_PERIOD ${setting}`)
  const end = todayDate()
  const monthsBack = 3
  const start = new Date(end.getFullYear(), end.getMonth() - monthsBack, 1, 12)
  const lastDay = new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate()
  start.setDate(Math.min(end.getDate(), lastDay))
  return { start: isoDate(start), end: isoDate(end), monthsBack }
}

export const SALMA = {
  firstName: 'Salma',
  lastName: 'Idrissi',
  email: 'salma.idrissi@atlas-negoce.ma',
  password: 'Atlas#Negoce2026',
}
