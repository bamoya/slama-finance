// Seeds Atlas Négoce history through the real API (run after ch02, before ch03..ch09).
import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import fs from 'node:fs'
import { Api, HERE, OUT, mailFor, clearMailFor } from './lib.mjs'
import { COMPANY, KARIM, ORG } from './data.mjs'

export const STAFF_PASSWORD = 'Atlas#Negoce2026'
const ROOT = path.resolve(HERE, '../../../..')
let seedN = 20260801
const rnd = () => (seedN = (seedN * 1664525 + 1013904223) % 4294967296) / 4294967296
const pick = (a) => a[Math.floor(rnd() * a.length)]
const iso = (d) => d.toISOString().slice(0, 10)
const addDays = (s, n) => {
  const d = new Date(s + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return iso(d)
}

async function tempPassword(email, slug) {
  const end = Date.now() + 40000
  while (Date.now() < end) {
    const list = await mailFor(email, { subjectIncludes: 'accès administrateur' })
    for (const m of list.sort((a, b) => new Date(b.Created) - new Date(a.Created))) {
      const full = await (await fetch(`http://localhost:8025/api/v1/message/${m.ID}`)).json()
      if (full.Text.includes(`${slug}.localhost`))
        return full.Text.split('\n')
          .map((l) => l.trim())
          .filter(Boolean)[3]
    }
    await new Promise((r) => setTimeout(r, 1000))
  }
  throw new Error('temporary password mail not found for ' + slug)
}
const apiCache = new Map()
export async function staffApi(slug, email, password = STAFF_PASSWORD) {
  const key = `${slug}|${email}`
  if (apiCache.has(key)) return apiCache.get(key)
  const api = await staffLogin(slug, email, password)
  apiCache.set(key, api)
  return api
}
async function staffLogin(slug, email, password) {
  const api = new Api(`${slug}.localhost:5174`)
  try {
    await api.post('/api/v1/organization-auth/login', { email, password })
    return api
  } catch {}
  const temp = await tempPassword(email, slug)
  await api.post('/api/v1/organization-auth/login', { email, password: temp })
  await api.post('/api/v1/organization-auth/change-password', {
    currentPassword: temp,
    newPassword: password,
  })
  return api
}
let ownerCache
/** Forget cached API sessions (needed after a DB snapshot restore). */
export function resetApiCache() {
  apiCache.clear()
  ownerCache = undefined
}
export async function ownerApi() {
  if (ownerCache) return ownerCache
  const api = new Api('app.localhost:5174')
  await api.post('/api/v1/owner-auth/login', { email: KARIM.email, password: KARIM.password })
  ownerCache = api
  return api
}
function demoEnv() {
  const env = execFileSync('bash', [path.join(HERE, '../demo-env.sh'), 'env']).toString()
  return Object.fromEntries(
    env
      .trim()
      .split('\n')
      .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
  )
}
function confirmSubscription(paymentId) {
  execFileSync(
    'npx',
    [
      'tsx',
      'scripts/subscription-payment.ts',
      'confirm',
      paymentId,
      '--by',
      'bfinance-demo',
      '--received',
      'VIR-ATLAS-2026-11',
    ],
    { cwd: path.join(ROOT, 'api'), env: { ...process.env, ...demoEnv() }, stdio: 'inherit' },
  )
}

const CATEGORIES = [
  'Engrais',
  'Semences',
  'Irrigation',
  'Protection des cultures',
  'Serres et bâches',
]
const PRODUCTS = [
  ['ENG-001', 'Engrais NPK 15-15-15 (sac 50 kg)', 'Engrais', 50000, 385],
  ['ENG-002', 'Urée 46 % (sac 50 kg)', 'Engrais', 50000, 340],
  ['ENG-003', 'Fertilisant liquide soluble (20 L)', 'Engrais', 22000, 640],
  ['SEM-001', 'Semences de blé dur (sac 25 kg)', 'Semences', 25000, 410],
  ['SEM-002', 'Semences d’orge (sac 25 kg)', 'Semences', 25000, 290],
  ['IRR-001', 'Kit goutte-à-goutte 1 hectare', 'Irrigation', 18000, 4850],
  ['IRR-002', 'Tuyau PE 16 mm (rouleau 500 m)', 'Irrigation', 12000, 1250],
  ['IRR-003', 'Filtre à disque 2 pouces', 'Irrigation', 1500, 690],
  ['IRR-004', 'Pompe d’arrosage 3 CV', 'Irrigation', 28000, 5400],
  ['PRO-001', 'Fongicide à base de cuivre (5 L)', 'Protection des cultures', 5000, 520],
  ['PRO-002', 'Herbicide total (20 L)', 'Protection des cultures', 21000, 860],
  ['SER-001', 'Bâche de serre 200 µm (8 m x 50 m)', 'Serres et bâches', 40000, 3200],
]
const CLIENTS = [
  [
    'Domaine Aït Yahia',
    'Hassan Aït Yahia',
    'Meknès',
    '002345187000021',
    'hassan@domaine-aityahia.ma',
    '+212 661 24 57 10',
  ],
  [
    'Ferme Oulad Saïd',
    'Rachid Saïdi',
    'Khémisset',
    '001987412000067',
    'compta@ferme-ouladsaid.ma',
    '+212 662 80 11 45',
  ],
  [
    'Coopérative Agricole Saïss',
    'Fatima Zahra Lahlou',
    'Fès',
    '002210048000033',
    'direction@coop-saiss.ma',
    '+212 535 62 40 18',
  ],
  [
    'Agro Fès Distribution',
    'Omar Tazi',
    'Fès',
    '001765309000085',
    'achats@agrofes-distribution.ma',
    '+212 535 64 22 90',
  ],
  [
    'Les Vergers de l’Atlas',
    'Mehdi El Fassi',
    'Azrou',
    '002078563000019',
    'contact@vergers-atlas.ma',
    '+212 661 77 03 28',
  ],
  [
    'Domaine El Ouazzani',
    'Youssef El Ouazzani',
    'Sefrou',
    '001654892000044',
    'y.elouazzani@domaine-ouazzani.ma',
    '+212 663 19 85 02',
  ],
  [
    'Pépinière Sidi Kacem',
    'Samira Berrada',
    'Sidi Kacem',
    '002401775000052',
    'samira@pepiniere-sidikacem.ma',
    '+212 537 59 12 36',
  ],
  [
    'Ferme Bennani & Fils',
    'Abdelilah Bennani',
    'Moulay Idriss Zerhoun',
    '001832266000071',
    'bennani.fils@ferme-bennani.ma',
    '+212 661 03 44 71',
  ],
  [
    'Coopérative Al Amal Ifrane',
    'Khadija Moussaoui',
    'Ifrane',
    '002156704000028',
    'alamal.ifrane@coop-alamal.ma',
    '+212 535 56 71 03',
  ],
  [
    'SARL Agri Haouz Services',
    'Nabil Chraibi',
    'Meknès',
    '001990127000036',
    'nabil@agrihaouz-services.ma',
    '+212 662 31 90 64',
  ],
]

export async function seed() {
  // 1. Subscription (owner): Business, paid
  const owner = await ownerApi()
  const sub = await owner.get('/api/v1/owner/subscription')
  if (sub.planCode !== 'business' || sub.status === 'trial') {
    const p = await owner.post('/api/v1/owner/subscription/payments', {
      planCode: 'business',
      cycle: 'annual',
      method: 'bank_transfer',
      reference: 'VIR-ATLAS-2026-11',
    })
    confirmSubscription(p.id ?? p.payment?.id)
  }
  const orgs = await owner.get('/api/v1/owner/organizations')
  const org1 = (orgs.items ?? orgs).find((o) => o.slug === ORG.slug)

  // 2. Workspace
  const w = await staffApi(ORG.slug, KARIM.email)
  const cs = await w.get('/api/v1/company-settings')
  await w.patch('/api/v1/company-settings', {
    ...stripMeta(cs),
    legalName: COMPANY.legalName,
    tradeName: 'Atlas Négoce',
    legalForm: 'SARL',
    shareCapital: '500000.00',
    addressLine1: COMPANY.address,
    city: COMPANY.city,
    postalCode: '50000',
    countryCode: 'MA',
    ice: COMPANY.ice,
    taxIdentifier: COMPANY.if,
    registrationNumber: COMPANY.rc,
    registrationCity: 'Meknès',
    professionalTaxNumber: '11052347',
    email: COMPANY.email,
    phone: COMPANY.phone,
    currency: 'MAD',
    locale: 'fr-MA',
    paymentDueDays: 30,
    estimateValidDays: 15,
    defaultVatRate: '20.00',
    expectedVersion: cs.version ?? cs.expectedVersion ?? 1,
  })
  const bank = await w.post('/api/v1/bank-accounts', {
    name: 'Compte principal',
    bankName: COMPANY.bankName,
    accountHolder: COMPANY.legalName,
    rib: COMPANY.rib,
    iban: COMPANY.iban,
    currency: 'MAD',
  })
  const cs2 = await w.get('/api/v1/company-settings')
  await w.patch('/api/v1/company-settings', {
    ...stripMeta(cs2),
    defaultBankAccountId: bank.id,
    expectedVersion: cs2.version,
  })

  const cat = {}
  for (const n of CATEGORIES)
    cat[n] = (await w.post('/api/v1/categories', { name: n, description: null })).id
  const variants = []
  for (const [reference, name, c, weightG, price] of PRODUCTS) {
    const p = await w.post('/api/v1/products', {
      reference,
      name,
      description: null,
      categoryId: cat[c],
      imageAssetId: null,
      suggestedVatRate: '20.00',
      variants: [
        {
          weightG,
          pricePerItem: price.toFixed(2),
          costPerItem: (price * 0.72).toFixed(2),
          active: true,
        },
      ],
    })
    variants.push({ id: p.variants[0].id, name, price })
  }
  const clients = []
  for (const [legalName, contactName, city, ice, email, phone] of CLIENTS) {
    const c = await w.post('/api/v1/clients', {
      type: 'company',
      legalName,
      contactName,
      email,
      phone,
      ice,
      addressLine1: `${Math.floor(rnd() * 90 + 3)}, Avenue Hassan II`,
      city,
      postalCode: '50000',
      countryCode: 'MA',
      locale: 'fr-MA',
    })
    clients.push({ id: c.id, name: legalName, email })
  }
  const lines = () =>
    Array.from({ length: 1 + Math.floor(rnd() * 3) }, () => {
      const v = pick(variants)
      const q = v.price > 3000 ? 1 + Math.floor(rnd() * 2) : 5 + Math.floor(rnd() * 40)
      return {
        productVariantId: v.id,
        productName: v.name,
        quantity: q,
        unitPrice: v.price.toFixed(2),
        vatRate: '20.00',
      }
    })

  // invoices Aug-Oct 2026, chronological so numbers are ordered
  const plan = []
  for (const [month, count] of [
    ['2026-08', 8],
    ['2026-09', 11],
    ['2026-10', 13],
  ]) {
    const days = Array.from({ length: count }, () => 1 + Math.floor(rnd() * 27)).sort(
      (a, b) => a - b,
    )
    for (const d of days) plan.push(`${month}-${String(d).padStart(2, '0')}`)
  }
  const today = '2026-11-01'
  const stats = { invoices: 0, payments: 0, estimates: 0 }
  for (const date of plan) {
    const client = pick(clients)
    const doc = await w.post('/api/v1/invoices', {
      clientId: client.id,
      templateId: null,
      issueDate: date,
      dueDate: addDays(date, 30),
      notes: null,
      paymentTerms: 'Paiement à 30 jours',
      bankAccountId: bank.id,
      agreedPaymentMethod: 'bank_transfer',
      lines: lines(),
    })
    const issued = await w.post(`/api/v1/invoices/${doc.id}/issue`, {
      expectedVersion: doc.version,
    })
    stats.invoices++
    const total = Number(issued.totalTtc ?? issued.amountTtc ?? issued.total ?? 0)
    const age = (new Date(today) - new Date(date)) / 86400000
    const roll = rnd()
    let paidAmount = 0,
      partial = false
    if (age > 40 ? roll < 0.85 : age > 15 ? roll < 0.55 : roll < 0.25) paidAmount = total
    else if (roll < 0.8 && age > 10) {
      paidAmount = Math.round(total * (0.3 + rnd() * 0.4))
      partial = true
    }
    if (paidAmount > 0) {
      const payDate = addDays(date, Math.min(Math.floor(age) - 1, 8 + Math.floor(rnd() * 20)))
      const method = pick(['bank_transfer', 'bank_transfer', 'cheque', 'cash'])
      const body = {
        operationId: randomUUID(),
        invoiceId: doc.id,
        amount: paidAmount.toFixed(2),
        currency: 'MAD',
        method,
        status: method === 'cheque' ? 'pending' : 'confirmed',
        paymentDate: payDate,
        collectedOn: method === 'cheque' ? null : payDate,
        bankAccountId: method === 'cash' ? null : bank.id,
        reference: partial ? 'Acompte' : `REF-${date.slice(5, 7)}${Math.floor(rnd() * 900 + 100)}`,
        chequeBank:
          method === 'cheque'
            ? pick(['Attijariwafa bank', 'Banque Populaire', 'BMCE Bank of Africa', 'CIH Bank'])
            : null,
        chequeNumber: method === 'cheque' ? String(Math.floor(rnd() * 9000000 + 1000000)) : null,
      }
      if (method !== 'bank_transfer') body.reference = null
      let pay = await w.post('/api/v1/payments', body).catch((e) => {
        console.warn('payment failed', e.message.slice(0, 200))
        return null
      })
      if (pay && method === 'cheque' && age > 12)
        pay = await w
          .post(`/api/v1/payments/${pay.id}/confirm`, {
            expectedVersion: pay.version,
            collectedOn: addDays(payDate, 2),
          })
          .catch((e) => {
            console.warn('confirm failed', e.message.slice(0, 200))
            return pay
          })
      if (pay) stats.payments++
    }
  }
  // estimates (recent), some accepted
  for (let i = 0; i < 8; i++) {
    const date = addDays('2026-10-04', i * 3)
    const e = await w.post('/api/v1/estimates', {
      clientId: pick(clients).id,
      templateId: null,
      issueDate: date,
      validUntil: addDays(date, 15),
      notes: null,
      paymentTerms: 'Paiement à 30 jours',
      bankAccountId: bank.id,
      agreedPaymentMethod: 'bank_transfer',
      lines: lines(),
    })
    const issued = await w.post(`/api/v1/estimates/${e.id}/issue`, { expectedVersion: e.version })
    if (i % 3 === 0)
      await w
        .post(`/api/v1/estimates/${e.id}/accept`, { expectedVersion: issued.version })
        .catch(() => {})
    stats.estimates++
  }
  console.log('seeded', stats)
  return { w, org1, bank, clients, variants }
}
const KEYS = [
  'legalName',
  'tradeName',
  'legalForm',
  'shareCapital',
  'addressLine1',
  'addressLine2',
  'city',
  'postalCode',
  'countryCode',
  'ice',
  'taxIdentifier',
  'registrationNumber',
  'registrationCity',
  'professionalTaxNumber',
  'email',
  'phone',
  'logoAssetId',
  'currency',
  'locale',
  'timezone',
  'paymentDueDays',
  'estimateValidDays',
  'defaultBankAccountId',
  'defaultTemplateId',
  'defaultVatRate',
]
const stripMeta = (o) => Object.fromEntries(KEYS.filter((k) => k in o).map((k) => [k, o[k]]))
if (import.meta.url === `file://${process.argv[1]}`) await seed()

/** Browser storage state for an authenticated API session (cookies are host-only). */
export function stateFor(api, file) {
  const host = api.host.split(':')[0]
  const state = {
    cookies: Object.entries(api.cookies).map(([name, value]) => ({
      name,
      value,
      domain: host,
      path: '/',
      expires: -1,
      httpOnly: true,
      secure: false,
      sameSite: 'Lax',
    })),
    origins: [],
  }
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(state))
  return file
}
