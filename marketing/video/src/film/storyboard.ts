// Storyboard of the marketing film (max 90 s): edit wording, timings, speed-ups and cut-downs here (no code changes needed).
// Times are in seconds. `speed` / `trim` use SOURCE seconds of the clip (public/clips/<clip>.mp4 + .json).

import type { AnimationId } from './animations'

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

// Compare scene: two browser frames side by side, each showing a window (source pixels x, y, width) of its clip.
export type CompareView = { t: number; x: number; y: number; w: number } // t = source seconds, eased between keyframes
export type CompareSide = {
  clip: ClipRef
  label: string
  role: string
  view: CompareView[]
  viewSquare?: CompareView[]
}

export type Scene =
  | { id: string; kind: 'intro'; seconds?: number; title: string; subtitle?: string }
  | { id: string; kind: 'clip'; seconds?: number; caption: string; clip: ClipRef; mood?: 'light' }
  | { id: string; kind: 'question'; seconds?: number; text: string }
  | {
      id: string
      kind: 'compare'
      seconds?: number
      caption: string
      left: CompareSide
      right: CompareSide
    }
  // approved animation (src/film/animations)
  | { id: string; kind: 'anim'; seconds: number; anim: AnimationId }
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
    seconds: 2.5,
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
      keep: [k(0.2, 2.7, 1.2), k(2.7, 3.9), k(3.9, 8.9), k(8.9, 13.2)],
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
      keep: [k(0.3, 3.0, 1.2), k(3.0, 9.2)],
      badges: [{ event: 'Organisation créée', text: 'Organisation créée', tone: 'green' }],
    },
  },
  {
    id: 'clip3',
    kind: 'clip',
    caption: 'Chiffre d’affaires, encaissements, retards : tout est là.',
    clip: {
      id: 'clip3-tableau-de-bord',
      host: H,
      keep: [k(0.2, 8.4, 1.3), k(8.4, 12.0), k(12.0, 17.0, 1.25)],
    },
  },
  {
    id: 'clip4',
    kind: 'clip',
    caption: 'Une facture en quelques clics.',
    // form filled, draft + issue
    clip: { id: 'clip4-facture', host: H, keep: [k(0.3, 11.6, 1.5), k(11.6, 15.9)] },
  },
  { id: 'anim-invoice', kind: 'anim', anim: 'invoice', seconds: 5.2 },
  {
    id: 'clip4b',
    kind: 'clip',
    caption: 'Le client la reçoit avec son PDF.',
    // the real e-mail received by the client
    clip: { id: 'clip4-facture', host: H, keep: [k(17.0, 20.6)] },
  },
  { id: 'anim-reminder', kind: 'anim', anim: 'reminder', seconds: 8.4 },
  {
    id: 'clip6',
    kind: 'clip',
    caption: 'Le rappel part avec le solde restant dû.',
    // reminder e-mail (a beat), invoice, payment typed, dashboard updated (+ green "Payée")
    clip: {
      id: 'clip6-relance-paiement',
      host: H,
      keep: [k(0.3, 2.3), k(4.1, 7.6, 1.3), k(8.7, 11.2)],
      badges: [{ event: 'Facture réglée', text: 'Payée', tone: 'green' }],
    },
  },
  {
    id: 'clip7',
    kind: 'clip',
    caption: 'Suivez tout, sans y penser.',
    // real scheduled send: schedule page, report e-mail received, PDF attachment opened and scrolled
    clip: { id: 'clip7-rapport', host: H, keep: [k(0.2, 14)] },
  },
  { id: 'q-equipe', kind: 'question', seconds: 3.2, text: 'Votre comptable a besoin d’accès ?' },
  {
    id: 'clip8',
    kind: 'clip',
    caption: 'Un rôle, des droits précis.',
    clip: { id: 'clip8-invitation', host: H, keep: [k(0.1, 2.8, 1.3), k(2.8, 4.6), k(4.6, 8.0)] },
  },
  {
    id: 'clip8b',
    kind: 'compare',
    caption: 'Salma ne voit que ce dont elle a besoin.',
    // left: Karim (administrateur) sees the whole menu; right: Salma logs in for real and tries the settings page
    left: {
      clip: { id: 'clip8b-menu-admin', host: H, keep: [k(0.2, 5.2)] },
      label: 'Karim',
      role: 'Administrateur',
      view: [{ t: 0, x: 0, y: 0, w: 1000 }],
      viewSquare: [{ t: 0, x: 0, y: 0, w: 520 }],
    },
    right: {
      clip: { id: 'clip8b-acces-limite', host: H, keep: [k(0.2, 12)] },
      label: 'Salma',
      role: 'Comptable',
      view: [{ t: 0, x: 0, y: 0, w: 1000 }],
      viewSquare: [{ t: 0, x: 0, y: 0, w: 520 }],
    },
  },
  { id: 'q-modeles', kind: 'question', seconds: 3.2, text: 'Des factures qui vous ressemblent ?' },
  { id: 'anim-template', kind: 'anim', anim: 'template', seconds: 6.2 },
  {
    id: 'clip9',
    kind: 'clip',
    caption: 'Aperçu en direct : couleur, mise en page, logo.',
    clip: { id: 'clip9-modele', host: H, keep: [k(0.3, 6.6, 1.4), k(6.6, 10.4)] },
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
      { scene: 'clip4' },
      { scene: 'anim-invoice' },
      { scene: 'clip4b' },
      { scene: 'outro', seconds: 4, mini: true },
    ],
  },
  relances: {
    compositionId: 'Film-Relances',
    scenes: [
      { scene: 'anim-reminder' },
      { scene: 'clip6' },
      { scene: 'outro', seconds: 4, mini: true },
    ],
  },
  rapports: {
    compositionId: 'Film-Rapports',
    scenes: [{ scene: 'clip7' }, { scene: 'outro', seconds: 4, mini: true }],
  },
  modeles: {
    compositionId: 'Film-Modeles',
    scenes: [
      { scene: 'anim-template' },
      { scene: 'clip9' },
      { scene: 'outro', seconds: 4, mini: true },
    ],
  },
}

export const FILM_FPS = 30
export const FADE_FRAMES = 8 // crossfade between scenes (<= 10 frames)
