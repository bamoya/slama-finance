import { loadFont } from '@remotion/google-fonts/Inter'

const { fontFamily } = loadFont('normal', {
  weights: ['400', '500', '600', '700', '800'],
  subsets: ['latin'],
})

// Tokens mirror ui/src/features/platform/marketing/styles/marketing.css (light theme).
export const theme = {
  font: `${fontFamily}, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`,
  background: '#f7f8fa',
  surface: '#ffffff',
  muted: '#f0f2f5',
  ink: '#252a32',
  body: '#495463',
  caption: '#626c79',
  border: '#e2e6ec',
  primary: '#946f29',
  gold: '#a77b28',
  accentSoft: '#f7f3ec',
  navy: '#23292b',
  shadow: '0 30px 80px rgba(20,32,42,0.14), 0 4px 14px rgba(20,32,42,0.08)',
}

export const FPS = 30
export const INTRO_FRAMES = 75 // 2.5 s
export const OUTRO_FRAMES = 90 // 3 s
export const CROSSFADE_FRAMES = 12
