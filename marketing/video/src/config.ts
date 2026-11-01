import manifest from './recordings.generated.json'

export type EventType = 'click' | 'type' | 'pause' | 'navigate'
export type TimelineEvent = {
  t: number
  type: EventType
  label: string
  box: { x: number; y: number; width: number; height: number }
}
export type Timeline = { duration: number; events: TimelineEvent[] }

export type ChapterConfig = {
  id: string // chNN
  compositionId: string
  title: string
  subtitle: string
  host: string
}

export const chapters: ChapterConfig[] = [
  {
    id: 'ch01',
    compositionId: 'Chapter-01-Compte',
    title: 'Créez votre compte',
    subtitle: 'Inscrivez-vous en moins d’une minute, sans carte bancaire.',
    host: 'app.bfinance.ma',
  },
  {
    id: 'ch02',
    compositionId: 'Chapter-02-Organisation',
    title: 'Créez votre organisation',
    subtitle: 'L’adresse de votre espace se forme automatiquement.',
    host: 'app.bfinance.ma',
  },
  {
    id: 'ch03',
    compositionId: 'Chapter-03-Client',
    title: 'Ajoutez un client',
    subtitle: 'Centralisez les informations de vos clients en quelques clics.',
    host: 'atlas-negoce.bfinance.ma',
  },
  {
    id: 'ch04',
    compositionId: 'Chapter-04-Modeles',
    title: 'Personnalisez vos modèles',
    subtitle: 'Logo, couleurs et mentions légales à l’image de votre entreprise.',
    host: 'atlas-negoce.bfinance.ma',
  },
  {
    id: 'ch05',
    compositionId: 'Chapter-05-Devis',
    title: 'Envoyez un devis',
    subtitle: 'Un devis clair et professionnel, envoyé en un instant.',
    host: 'atlas-negoce.bfinance.ma',
  },
  {
    id: 'ch06',
    compositionId: 'Chapter-06-Facture',
    title: 'Transformez-le en facture',
    subtitle: 'Un devis accepté devient une facture en un clic.',
    host: 'atlas-negoce.bfinance.ma',
  },
  {
    id: 'ch07',
    compositionId: 'Chapter-07-Encaissement',
    title: 'Encaissez et relancez automatiquement',
    subtitle: 'Suivez les paiements et laissez B-Finance relancer pour vous.',
    host: 'atlas-negoce.bfinance.ma',
  },
  {
    id: 'ch08',
    compositionId: 'Chapter-08-Equipe',
    title: 'Invitez votre équipe',
    subtitle: 'Donnez à chacun les droits dont il a besoin.',
    host: 'atlas-negoce.bfinance.ma',
  },
  {
    id: 'ch09',
    compositionId: 'Chapter-09-Rapports',
    title: 'Recevez vos rapports',
    subtitle: 'Votre activité résumée, directement dans votre boîte mail.',
    host: 'app.bfinance.ma',
  },
]

export type Source = { video: string; timeline: string; real: boolean }

// Convention: public/recordings/chNN-<name>.mp4 + chNN-<name>.json (see render/manifest.mjs).
export const sourceFor = (id: string): Source => {
  const base = (manifest as Record<string, string>)[id]
  return base
    ? { video: `recordings/${base}.mp4`, timeline: `recordings/${base}.json`, real: true }
    : { video: 'placeholder/sample.mp4', timeline: 'placeholder/sample.json', real: false }
}
