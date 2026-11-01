// Storyboard of the marketing film (max 90 s): edit wording, timings, speed-ups and cut-downs here (no code changes needed).
// Times are in seconds. `speed` / `trim` use SOURCE seconds of the clip (public/clips/<clip>.mp4 + .json).

export type Speed = { from: number; to: number; rate: number }
export type Badge = { event: string; text: string; tone: 'green' | 'gold' } // event = substring of a timeline label

export type ClipRef = {
  id: string // public/clips/<id>.mp4 + <id>.json
  host: string
  trim?: [number, number] // source seconds kept (default: whole clip)
  speed?: Speed[] // faster playback ranges (source seconds), rate 1.5-2 on typing
  keep?: Speed[] // alternative to trim+speed: ordered pieces [from,to,rate] kept (jump cuts between them)
  badges?: Badge[]
}

export type Scene =
  | { id: string; kind: 'intro'; seconds?: number; title: string; subtitle?: string }
  | { id: string; kind: 'clip'; seconds?: number; caption: string; clip: ClipRef; mood?: 'light' }
  | { id: string; kind: 'question'; seconds?: number; text: string }
  | { id: string; kind: 'problem'; seconds?: number; title: string; clip: ClipRef }
  // question card first, then the clip with its caption
  | {
      id: string
      kind: 'ask-clip'
      seconds?: number
      questionSeconds: number
      text: string
      caption?: string
      clip: ClipRef
    }
  | { id: string; kind: 'outro'; seconds?: number; title: string; cta: string }

const H = 'atlas-negoce.bfinance.ma'
const APP = 'app.bfinance.ma'
const k = (from: number, to: number, rate = 1): Speed => ({ from, to, rate })

// Scene length: `seconds` if given, otherwise the length of its kept clip pieces (+ HOLD_TAIL s) so nothing is cut off.
export const SCENES: Scene[] = [
  {
    id: 'intro',
    kind: 'intro',
    seconds: 5.5,
    title: 'B-Finance',
    subtitle: 'La finance de votre entreprise, enfin claire.',
  },
  {
    id: 'clip1',
    kind: 'clip',
    caption: 'Toutes vos entreprises, une seule vue.',
    // login, overview, period picker, then a beat on the consolidated numbers (real speed, x1.2-1.3 on mouse travel)
    clip: {
      id: 'clip1-vue-ensemble',
      host: APP,
      keep: [k(0.2, 3.0, 1.2), k(3.0, 4.0), k(4.0, 10.7, 1.3), k(10.7, 15.5)],
    },
  },
  { id: 'q-societes', kind: 'question', seconds: 3.5, text: 'Vous gérez plus d’une société ?' },
  {
    id: 'clip2',
    kind: 'clip',
    caption: 'Ajoutez-la en quelques secondes.',
    // name typed, address forms itself, wizard cut, organisation created (+ hold)
    clip: {
      id: 'clip2-nouvelle-organisation',
      host: APP,
      keep: [k(0.4, 9.0)],
      badges: [{ event: 'Organisation créée', text: 'Organisation créée', tone: 'green' }],
    },
  },
  {
    id: 'clip3',
    kind: 'clip',
    caption: 'Chiffre d’affaires, encaissements, retards : tout est là.',
    clip: { id: 'clip3-tableau-de-bord', host: H, keep: [k(0.2, 9.5, 1.3), k(9.5, 17.5)] },
  },
  {
    id: 'clip4',
    kind: 'clip',
    caption: 'Facturez et envoyez en un clic.',
    // form filled, draft + issue, invoice e-mail received
    clip: { id: 'clip4-facture', host: H, keep: [k(0.3, 12.6, 1.2), k(12.7, 16.9)] },
  },
  {
    id: 'clip5',
    kind: 'problem',
    title: 'Vos clients oublient de payer ?',
    clip: { id: 'clip5-retards', host: H, keep: [k(0.4, 7.2)] },
  },
  {
    id: 'clip6',
    kind: 'clip',
    caption: 'Les relances partent toutes seules.',
    // reminder e-mail (a beat), invoice, payment typed, dashboard updated (+ green "Payée")
    clip: {
      id: 'clip6-relance-paiement',
      host: H,
      keep: [k(0.4, 11.9)],
      badges: [{ event: 'Facture réglée', text: 'Payée', tone: 'green' }],
    },
  },
  {
    id: 'clip7',
    kind: 'clip',
    caption: 'Suivez tout, sans y penser.',
    clip: { id: 'clip7-rapport', host: H, keep: [k(0.2, 9.5), k(9.5, 13.5, 1.3), k(13.5, 17.3)] },
  },
  {
    id: 'clip8',
    kind: 'ask-clip',
    questionSeconds: 3.2,
    text: 'Votre comptable a besoin d’accès ?',
    caption: 'Chacun ses droits.',
    clip: { id: 'clip8-invitation', host: H, keep: [k(0.2, 8.8)] },
  },
  {
    id: 'clip9',
    kind: 'ask-clip',
    questionSeconds: 3.2,
    text: 'Des factures qui vous ressemblent ?',
    clip: { id: 'clip9-modele', host: H, keep: [k(0.3, 5.4, 1.3), k(6.5, 12.9)] },
  },
  { id: 'outro', kind: 'outro', seconds: 5, title: 'Essai gratuit de 7 jours', cta: 'bfinance.ma' },
]

export const HOLD_TAIL = 1.0 // hold after the key result (email received, payment green, org created, preview updated)

// Short cut-downs for feature pages. `scene` references a SCENES id; `seconds` optionally overrides its length.
export type CutdownScene = { scene: string; seconds?: number; mini?: boolean; keep?: Speed[] } // keep overrides the clip pieces
export const CUTDOWNS: Record<string, { compositionId: string; scenes: CutdownScene[] }> = {
  facturation: {
    compositionId: 'Film-Facturation',
    scenes: [
      { scene: 'clip4', keep: [k(0.3, 16.9)] },
      { scene: 'outro', seconds: 4, mini: true },
    ],
  },
  relances: {
    compositionId: 'Film-Relances',
    scenes: [{ scene: 'clip5' }, { scene: 'clip6' }, { scene: 'outro', seconds: 4, mini: true }],
  },
  rapports: {
    compositionId: 'Film-Rapports',
    scenes: [
      { scene: 'clip7', keep: [k(0.2, 17.3)] },
      { scene: 'outro', seconds: 4, mini: true },
    ],
  },
  modeles: {
    compositionId: 'Film-Modeles',
    scenes: [
      { scene: 'clip9', keep: [k(0.3, 12.9)] },
      { scene: 'outro', seconds: 4, mini: true },
    ],
  },
}

export const FILM_FPS = 30
export const FADE_FRAMES = 8 // crossfade between scenes (<= 10 frames)
