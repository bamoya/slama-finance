import {
  AbsoluteFill,
  Img,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion'
import { theme } from '../theme'

const Backdrop = () => (
  <>
    <AbsoluteFill style={{ background: theme.background }} />
    <AbsoluteFill
      style={{
        background: `radial-gradient(1000px 600px at 50% 40%, ${theme.accentSoft}, transparent 70%)`,
      }}
    />
  </>
)

export const Intro = () => {
  const frame = useCurrentFrame()
  const { fps, durationInFrames } = useVideoConfig()
  const mark = spring({ frame, fps, config: { damping: 14, stiffness: 120 } })
  const word = spring({ frame: frame - 18, fps, config: { damping: 200 } })
  const tag = spring({ frame: frame - 34, fps, config: { damping: 200 } })
  const out = interpolate(frame, [durationInFrames - 8, durationInFrames], [1, 0], {
    extrapolateLeft: 'clamp',
  })
  return (
    <AbsoluteFill
      style={{ fontFamily: theme.font, alignItems: 'center', justifyContent: 'center' }}
    >
      <Backdrop />
      <div
        style={{
          opacity: out,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 22,
        }}
      >
        <Img
          src={staticFile('branding/b-finance-mark.png')}
          style={{
            width: 190,
            height: 190,
            mixBlendMode: 'multiply',
            transform: `scale(${0.5 + mark * 0.5}) rotate(${(1 - mark) * -12}deg)`,
            opacity: Math.min(1, mark * 1.5),
          }}
        />
        <div
          style={{
            fontSize: 96,
            fontWeight: 700,
            color: theme.ink,
            letterSpacing: -2,
            opacity: word,
            transform: `translateY(${(1 - word) * 24}px)`,
          }}
        >
          B-<span style={{ color: theme.primary }}>Finance</span>
        </div>
        <div
          style={{
            fontSize: 34,
            color: theme.body,
            opacity: tag,
            transform: `translateY(${(1 - tag) * 16}px)`,
            textAlign: 'center',
            padding: '0 80px',
          }}
        >
          La facturation claire pour les entreprises marocaines
        </div>
      </div>
    </AbsoluteFill>
  )
}

export const Outro = () => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const a = spring({ frame, fps, config: { damping: 200 } })
  const b = spring({ frame: frame - 14, fps, config: { damping: 200 } })
  const c = spring({ frame: frame - 28, fps, config: { damping: 200 } })
  return (
    <AbsoluteFill
      style={{ fontFamily: theme.font, alignItems: 'center', justifyContent: 'center' }}
    >
      <Backdrop />
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>
        <Img
          src={staticFile('branding/bamoya-finance.png')}
          style={{
            width: 560,
            mixBlendMode: 'multiply',
            opacity: a,
            transform: `scale(${0.94 + a * 0.06})`,
          }}
        />
        <div
          style={{
            fontSize: 56,
            fontWeight: 700,
            color: theme.ink,
            letterSpacing: -1,
            opacity: b,
            transform: `translateY(${(1 - b) * 18}px)`,
          }}
        >
          Essai gratuit de 7 jours
        </div>
        <div
          style={{
            fontSize: 34,
            fontWeight: 600,
            color: '#fff',
            background: theme.primary,
            padding: '14px 40px',
            borderRadius: 999,
            opacity: c,
            transform: `translateY(${(1 - c) * 14}px)`,
          }}
        >
          bfinance.ma
        </div>
      </div>
    </AbsoluteFill>
  )
}
