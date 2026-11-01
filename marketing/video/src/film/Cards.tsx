import { AbsoluteFill, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion'
import { theme } from '../theme'

const Backdrop = () => (
  <>
    <AbsoluteFill style={{ background: theme.background }} />
    <AbsoluteFill style={{ background: `radial-gradient(1000px 600px at 50% 40%, ${theme.accentSoft}, transparent 70%)` }} />
  </>
)

export const IntroCard = ({ title, subtitle }: { title: string; subtitle?: string }) => {
  const frame = useCurrentFrame()
  const { fps, width } = useVideoConfig()
  const square = width < 1500
  const mark = spring({ frame, fps, config: { damping: 12, stiffness: 120 } })
  const word = spring({ frame: frame - 10, fps, config: { damping: 16, stiffness: 120 } })
  const tag = spring({ frame: frame - 26, fps, config: { damping: 16, stiffness: 100 } })
  const line = spring({ frame: frame - 34, fps, config: { damping: 200 } })
  return (
    <AbsoluteFill style={{ fontFamily: theme.font, alignItems: 'center', justifyContent: 'center' }}>
      <Backdrop />
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20, padding: '0 70px', textAlign: 'center' }}>
        <Img
          src={staticFile('branding/b-finance-mark.png')}
          style={{ width: 170, height: 170, mixBlendMode: 'multiply', transform: `scale(${0.4 + mark * 0.6}) rotate(${(1 - mark) * -14}deg)`, opacity: Math.min(1, mark * 1.5) }}
        />
        <div style={{ fontSize: 92, fontWeight: 700, color: theme.ink, letterSpacing: -2, opacity: word, transform: `translateY(${(1 - word) * 26}px)` }}>
          B-<span style={{ color: theme.primary }}>{title.replace(/^B-/, '')}</span>
        </div>
        {subtitle && (
          <div style={{ fontSize: square ? 54 : 66, fontWeight: 700, lineHeight: 1.12, letterSpacing: -1, color: theme.ink, maxWidth: 1500, opacity: tag, transform: `translateY(${(1 - tag) * 30}px) scale(${0.95 + tag * 0.05})` }}>
            {subtitle}
          </div>
        )}
        <div style={{ width: 160 * line, height: 7, borderRadius: 4, background: theme.primary }} />
      </div>
    </AbsoluteFill>
  )
}

export const OutroCard = ({ title, cta, mini }: { title: string; cta: string; mini?: boolean }) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const a = spring({ frame, fps, config: { damping: 200 } })
  const b = spring({ frame: frame - 8, fps, config: { damping: 16, stiffness: 120 } })
  const c = spring({ frame: frame - 18, fps, config: { damping: 11, stiffness: 160 } })
  return (
    <AbsoluteFill style={{ fontFamily: theme.font, alignItems: 'center', justifyContent: 'center' }}>
      <Backdrop />
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: mini ? 16 : 22, padding: '0 60px', textAlign: 'center' }}>
        <Img
          src={staticFile(mini ? 'branding/b-finance-mark.png' : 'branding/bamoya-finance.png')}
          style={{ width: mini ? 130 : 520, mixBlendMode: 'multiply', opacity: a, transform: `scale(${0.94 + a * 0.06})` }}
        />
        <div style={{ fontSize: mini ? 54 : 70, fontWeight: 700, color: theme.ink, letterSpacing: -1, opacity: b, transform: `translateY(${(1 - b) * 22}px)` }}>
          {title}
        </div>
        <div style={{ fontSize: mini ? 38 : 46, fontWeight: 700, color: '#fff', background: theme.primary, padding: '14px 46px', borderRadius: 999, opacity: Math.min(1, c * 1.5), transform: `scale(${0.6 + c * 0.4})` }}>
          {cta}
        </div>
      </div>
    </AbsoluteFill>
  )
}

const Avatar = ({ size }: { size: number }) => {
  const frame = useCurrentFrame()
  const blink = frame % 70 > 66 ? 0.1 : 1
  const bob = Math.sin(frame / 14) * 3
  return (
    <svg width={size} height={size} viewBox="0 0 200 200" style={{ transform: `translateY(${bob}px)` }}>
      <circle cx="100" cy="100" r="96" fill={theme.accentSoft} stroke={theme.primary} strokeWidth="4" />
      <clipPath id="av"><circle cx="100" cy="100" r="94" /></clipPath>
      <g clipPath="url(#av)">
        <path d="M20 200 C28 150 60 140 100 140 C140 140 172 150 180 200 Z" fill={theme.navy} />
        <path d="M82 140 L100 168 L118 140 Z" fill="#fff" />
        <rect x="88" y="118" width="24" height="28" rx="10" fill="#e8b98d" />
        <ellipse cx="100" cy="92" rx="38" ry="44" fill="#f2c9a0" />
        <path d="M60 88 C58 48 84 36 104 38 C130 38 146 56 140 90 C132 70 118 62 98 62 C82 62 68 70 60 88 Z" fill="#3a2a22" />
        <ellipse cx="86" cy="94" rx="4.5" ry={5.5 * blink} fill="#2a2018" />
        <ellipse cx="114" cy="94" rx="4.5" ry={5.5 * blink} fill="#2a2018" />
        <path d="M84 112 C92 124 108 124 116 112" fill="none" stroke="#a5532f" strokeWidth="4" strokeLinecap="round" />
        <ellipse cx="76" cy="106" rx="7" ry="4" fill="#ef9f8c" opacity="0.5" />
        <ellipse cx="124" cy="106" rx="7" ry="4" fill="#ef9f8c" opacity="0.5" />
      </g>
    </svg>
  )
}

export const QuestionCard = ({ text }: { text: string }) => {
  const frame = useCurrentFrame()
  const { fps, width, durationInFrames } = useVideoConfig()
  const square = width < 1500
  const av = spring({ frame, fps, config: { damping: 11, stiffness: 140 } })
  const pop = spring({ frame: frame - 8, fps, config: { damping: 12, stiffness: 150 } })
  const words = text.split(' ')
  const size = square ? 58 : 72
  const out = interpolate(frame, [durationInFrames - 4, durationInFrames], [1, 0], { extrapolateLeft: 'clamp' })
  return (
    <AbsoluteFill style={{ fontFamily: theme.font, alignItems: 'center', justifyContent: 'center', opacity: out }}>
      <Backdrop />
      <div style={{ display: 'flex', flexDirection: square ? 'column' : 'row', alignItems: 'center', gap: square ? 40 : 70, padding: '0 90px' }}>
        <div style={{ transform: `scale(${0.3 + av * 0.7})`, opacity: av }}>
          <Avatar size={square ? 300 : 380} />
        </div>
        <div style={{ position: 'relative', maxWidth: square ? 880 : 1060, transform: `scale(${0.5 + pop * 0.5})`, transformOrigin: square ? '50% 100%' : '0% 70%', opacity: Math.min(1, pop * 2) }}>
          <div style={{ background: '#fff', borderRadius: 44, padding: '46px 60px', boxShadow: theme.shadow, border: `2px solid ${theme.border}` }}>
            <div style={{ fontSize: size, fontWeight: 700, lineHeight: 1.18, letterSpacing: -1, color: theme.ink }}>
              {words.map((w, i) => {
                const k = spring({ frame: frame - 14 - i * 4, fps, config: { damping: 14, stiffness: 160 } })
                return (
                  <span key={i} style={{ display: 'inline-block', marginRight: '0.28em', opacity: k, transform: `translateY(${(1 - k) * 18}px)` }}>
                    {w}
                  </span>
                )
              })}
            </div>
          </div>
          {square ? (
            <div style={{ position: 'absolute', left: '50%', top: -24, width: 0, height: 0, marginLeft: -22, borderLeft: '22px solid transparent', borderRight: '22px solid transparent', borderBottom: '26px solid #fff' }} />
          ) : (
            <div style={{ position: 'absolute', left: -26, top: '58%', width: 0, height: 0, borderTop: '22px solid transparent', borderBottom: '22px solid transparent', borderRight: '30px solid #fff' }} />
          )}
        </div>
      </div>
    </AbsoluteFill>
  )
}
