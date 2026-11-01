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
  | { id: string; kind: 'ask-clip'; seconds?: number; questionSeconds: number; text: string; caption?: string; clip: ClipRef }
  | { id: string; kind: 'outro'; seconds?: number; title: string; cta: string }

const H = 'atlas-negoce.bfinance.ma'
const APP = 'app.bfinance.ma'
const k = (from: number, to: number, rate = 1): Speed => ({ from, to, rate })

// Scene length: `seconds` if given, otherwise the length of its kept clip pieces (+ HOLD_TAIL s) so nothing is cut off.
export const SCENES: Scene[] = [
  { id: 'intro', kind: 'intro', seconds: 4, title: 'B-Finance', subtitle: 'La finance de votre entreprise, enfin claire.' },
  {
    id: 'clip1', kind: 'clip', caption: 'Toutes vos entreprises, une seule vue.',
    // login (typing x1.6), overview, period picker (x2), then a beat on the consolidated numbers
    clip: { id: 'clip1-vue-ensemble', host: APP, keep: [k(0.2, 3.0, 1.6), k(3.0, 4.4), k(4.4, 8.6, 2), k(8.6, 12.2)] },
  },
  { id: 'q-societes', kind: 'question', seconds: 3.5, text: 'Vous gérez plus d’une société ?' },
  {
    id: 'clip2', kind: 'clip', caption: 'Ajoutez-la en quelques secondes.',
    // name typed, address forms itself, wizard cut, organisation created
    clip: { id: 'clip2-nouvelle-organisation', host: APP, keep: [k(0.9, 2.7, 1.5), k(2.7, 4.3, 1.4), k(4.3, 6.0), k(6.0, 9.0, 1.2)], badges: [{ event: 'Organisation créée', text: 'Organisation créée', tone: 'green' }] },
  },
  {
    id: 'clip3', kind: 'clip', caption: 'Chiffre d’affaires, encaissements, retards : tout est là.',
    clip: { id: 'clip3-tableau-de-bord', host: H, keep: [k(0.3, 5.3, 2), k(5.3, 12.5, 1.3)] },
  },
  {
    id: 'clip4', kind: 'clip', caption: 'Facturez et envoyez en un clic.',
    // form filled (x2.3), draft + issue (x2), invoice e-mail received
    clip: { id: 'clip4-facture', host: H, keep: [k(0.4, 10.6, 2.3), k(10.6, 14.6, 2.2), k(15.2, 18.4)] },
  },
  {
    id: 'clip5', kind: 'problem', title: 'Vos clients oublient de payer ?',
    clip: { id: 'clip5-retards', host: H, keep: [k(0.4, 2.9, 1.4), k(3.0, 7.2, 1.1)] },
  },
  {
    id: 'clip6', kind: 'clip', caption: 'Les relances partent toutes seules.',
    // reminder e-mail (a beat), invoice, payment typed, dashboard updated
    clip: { id: 'clip6-relance-paiement', host: H, keep: [k(0.2, 3.1), k(4.2, 6.0, 1.5), k(6.5, 10.4, 1.6), k(14.2, 18.0, 1.3)], badges: [{ event: 'Facture réglée', text: 'Payée', tone: 'green' }] },
  },
  {
    id: 'clip7', kind: 'clip', caption: 'Suivez tout, sans y penser.',
    clip: { id: 'clip7-rapport', host: H, keep: [k(0.3, 2.7, 1.6), k(5.0, 8.0), k(11.2, 16.0, 2.4), k(16.0, 18.0)] },
  },
  {
    id: 'clip8', kind: 'ask-clip', questionSeconds: 2.2, text: 'Votre comptable a besoin d’accès ?', caption: 'Chacun ses droits.',
    clip: { id: 'clip8-invitation', host: H, keep: [k(0.2, 1.0), k(1.0, 2.6, 1.6), k(2.6, 8.4, 1.15)] },
  },
  {
    id: 'clip9', kind: 'ask-clip', questionSeconds: 2.2, text: 'Des factures qui vous ressemblent ?',
    clip: { id: 'clip9-modele', host: H, keep: [k(0.3, 2.4, 2), k(2.4, 5.4, 1.6), k(7.5, 12.2)] },
  },
  { id: 'outro', kind: 'outro', seconds: 4, title: 'Essai gratuit de 7 jours', cta: 'bfinance.ma' },
]

export const HOLD_TAIL = 0.3

// Short cut-downs for feature pages. `scene` references a SCENES id; `seconds` optionally overrides its length.
export type CutdownScene = { scene: string; seconds?: number; mini?: boolean }
export const CUTDOWNS: Record<string, { compositionId: string; scenes: CutdownScene[] }> = {
  facturation: { compositionId: 'Film-Facturation', scenes: [{ scene: 'clip4' }, { scene: 'outro', seconds: 2.5, mini: true }] },
  relances: { compositionId: 'Film-Relances', scenes: [{ scene: 'clip5' }, { scene: 'clip6' }, { scene: 'outro', seconds: 2.5, mini: true }] },
  rapports: { compositionId: 'Film-Rapports', scenes: [{ scene: 'clip7' }, { scene: 'outro', seconds: 2.5, mini: true }] },
  modeles: { compositionId: 'Film-Modeles', scenes: [{ scene: 'clip9' }, { scene: 'outro', seconds: 2.5, mini: true }] },
}

export const FILM_FPS = 30
export const FADE_FRAMES = 8 // crossfade between scenes (<= 10 frames)
