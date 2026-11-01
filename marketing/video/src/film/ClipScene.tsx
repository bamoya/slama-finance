import {
  AbsoluteFill,
  Freeze,
  interpolate,
  OffthreadVideo,
  Sequence,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion'
import { BrowserFrame } from '../components/BrowserFrame'
import { Ring } from '../components/Chapter'
import { buildKeys, cameraAt, VIDEO_H, VIDEO_W } from '../camera'
import type { Timeline } from '../config'
import { theme } from '../theme'
import { buildPlan, outToSrc, planDuration, srcToOut } from './plan'
import type { ClipRef } from './storyboard'

export const dark = {
  bg: '#12151a',
  bg2: '#1f262f',
  ink: '#ffffff',
  body: '#d5dbe3',
  red: '#ff6b5e',
}
export const green = '#1f8a5b'

const Clock = ({ size, light }: { size: number; light: boolean }) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const sec = frame / fps
  // second hand ticks once per second with a small overshoot (clock tick motif)
  const step = Math.floor(sec)
  const k = spring({
    frame: frame - step * fps,
    fps,
    config: { damping: 8, stiffness: 400 },
    durationInFrames: 10,
  })
  const angle = (step + k) * 6 * 3 // 18 degrees per tick
  const c = light ? '#ffffff' : theme.ink
  return (
    <svg width={size} height={size} viewBox="0 0 100 100">
      <circle cx="50" cy="50" r="44" fill="none" stroke={c} strokeWidth="5" opacity="0.9" />
      {Array.from({ length: 12 }, (_, i) => (
        <line
          key={i}
          x1="50"
          y1="11"
          x2="50"
          y2={i % 3 === 0 ? 20 : 16}
          stroke={c}
          strokeWidth="3"
          transform={`rotate(${i * 30} 50 50)`}
          opacity="0.8"
        />
      ))}
      <line
        x1="50"
        y1="50"
        x2="50"
        y2="26"
        stroke={c}
        strokeWidth="5"
        strokeLinecap="round"
        transform={`rotate(${step * 2} 50 50)`}
      />
      <line
        x1="50"
        y1="56"
        x2="50"
        y2="14"
        stroke={dark.red}
        strokeWidth="3"
        strokeLinecap="round"
        transform={`rotate(${angle} 50 50)`}
      />
      <circle cx="50" cy="50" r="4.5" fill={dark.red} />
    </svg>
  )
}

const Video = ({
  clip,
  plan,
  endFrame,
}: {
  clip: ClipRef
  plan: ReturnType<typeof buildPlan>
  endFrame: number
}) => {
  const { fps } = useVideoConfig()
  const src = staticFile(`clips/${clip.id}.mp4`)
  const style = { width: VIDEO_W, height: VIDEO_H }
  const planEnd = Math.round(planDuration(plan) * fps)
  return (
    <>
      {plan.map((p, i) => (
        <Sequence
          key={i}
          from={Math.round(p.outStart * fps)}
          durationInFrames={Math.max(1, Math.round(p.outDur * fps))}
          layout="none"
        >
          <OffthreadVideo
            src={src}
            muted
            startFrom={Math.round(p.from * fps)}
            playbackRate={p.rate}
            style={style}
          />
        </Sequence>
      ))}
      {endFrame > planEnd && (
        <Sequence from={planEnd} durationInFrames={endFrame - planEnd} layout="none">
          <Freeze frame={0}>
            <OffthreadVideo
              src={src}
              muted
              startFrom={Math.max(0, Math.round(plan[plan.length - 1].to * fps) - 2)}
              style={style}
            />
          </Freeze>
        </Sequence>
      )}
    </>
  )
}

export const ClipScene = ({
  clip,
  timeline,
  caption,
  title,
  mood = 'light',
}: {
  clip: ClipRef
  timeline: Timeline
  caption?: string
  title?: string // big problem title (dark mood)
  mood?: 'light' | 'dark'
}) => {
  const frame = useCurrentFrame()
  const { fps, width, height, durationInFrames } = useVideoConfig()
  const square = width === height
  const isDark = mood === 'dark'
  const t = frame / fps
  const plan = buildPlan(clip, timeline.duration)
  const src = outToSrc(plan, t)
  // the dark problem scene keeps the full page in view (no zoom, so the sidebar is never cropped)
  const cam = title
    ? { cx: VIDEO_W / 2, cy: VIDEO_H / 2, s: 1 }
    : cameraAt(buildKeys(timeline), src)

  const frameW = title ? (square ? 860 : 1100) : square ? 980 : 1300
  const viewH = frameW * (VIDEO_H / VIDEO_W)
  const base = frameW / VIDEO_W
  const scale = base * cam.s
  const tx = frameW / 2 - cam.cx * scale
  const ty = viewH / 2 - cam.cy * scale
  const top = title ? (square ? 330 : 330) : square ? 250 : 170
  const bottomRoom = height - top - viewH - 46
  const frameTop = Math.min(top, top + bottomRoom / 2)

  const enter = spring({ frame: frame - 2, fps, config: { damping: 200 } })
  const capIn = spring({ frame: frame - 6, fps, config: { damping: 14, stiffness: 110 } })
  const frameIn = spring({ frame: frame - 3, fps, config: { damping: 18, stiffness: 120 } })

  const ink = isDark ? dark.ink : theme.ink
  const bg = isDark
    ? `radial-gradient(1200px 700px at 50% 0%, ${dark.bg2}, ${dark.bg} 75%)`
    : `radial-gradient(1000px 520px at 15% 0%, ${theme.accentSoft}, transparent 70%), ${theme.background}`

  const badges = (clip.badges ?? []).flatMap((b) => {
    const ev = timeline.events.find((e) => e.label.includes(b.event))
    return ev ? [{ ...b, at: srcToOut(plan, ev.t) }] : []
  })
  const paid = badges.find((b) => t >= b.at && b.tone === 'green')
  const flash = paid
    ? interpolate(t - paid.at, [0, 0.5], [0.35, 0], { extrapolateRight: 'clamp' })
    : 0

  return (
    <AbsoluteFill style={{ background: bg, fontFamily: theme.font }}>
      {isDark && (
        <AbsoluteFill
          style={{
            background:
              'radial-gradient(900px 500px at 50% 55%, rgba(255,107,94,0.14), transparent 70%)',
          }}
        />
      )}
      {title && (
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: square ? 70 : 54,
            padding: square ? '0 70px' : '0 260px',
            textAlign: 'center',
          }}
        >
          <div
            style={{
              fontSize: square ? 84 : 104,
              fontWeight: 800,
              lineHeight: 1.05,
              letterSpacing: -2,
              color: dark.ink,
              opacity: capIn,
              transform: `scale(${0.82 + capIn * 0.18}) translateY(${(1 - capIn) * 40}px)`,
              textShadow: '0 4px 30px rgba(0,0,0,0.5)',
            }}
          >
            {title}
          </div>
        </div>
      )}
      {title && (
        <div
          style={{
            position: 'absolute',
            right: square ? 40 : 90,
            top: square ? 40 : 60,
            opacity: enter,
          }}
        >
          <Clock size={square ? 90 : 120} light />
        </div>
      )}
      {caption && (
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: square ? 58 : 38,
            padding: '0 70px',
            textAlign: 'center',
          }}
        >
          <div
            style={{
              display: 'inline-block',
              fontSize: square ? 50 : 58,
              fontWeight: 700,
              letterSpacing: -1,
              lineHeight: 1.12,
              color: ink,
              opacity: capIn,
              transform: `translateY(${(1 - capIn) * 34}px) scale(${0.94 + capIn * 0.06})`,
            }}
          >
            {caption}
          </div>
          <div
            style={{
              width: 120 * capIn,
              height: 6,
              borderRadius: 3,
              background: theme.primary,
              margin: '12px auto 0',
            }}
          />
        </div>
      )}
      <div
        style={{
          position: 'absolute',
          left: (width - frameW) / 2,
          top: frameTop,
          opacity: frameIn,
          transform: `translateY(${(1 - frameIn) * 40}px) scale(${0.96 + frameIn * 0.04})`,
          filter: isDark ? 'drop-shadow(0 20px 60px rgba(0,0,0,0.6))' : undefined,
        }}
      >
        <BrowserFrame host={clip.host} width={frameW} height={viewH}>
          <div
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              width: VIDEO_W,
              height: VIDEO_H,
              transformOrigin: '0 0',
              transform: `translate(${tx}px, ${ty}px) scale(${scale})`,
            }}
          >
            <Video clip={clip} plan={plan} endFrame={durationInFrames} />
            {timeline.events.map((e, i) =>
              e.type === 'highlight' ? (
                <Highlight key={i} box={e.box} age={src - e.t} />
              ) : (
                <Ring key={i} box={e.box} age={src - e.t} type={e.type} />
              ),
            )}
          </div>
          {flash > 0 && (
            <AbsoluteFill style={{ background: green, opacity: flash, pointerEvents: 'none' }} />
          )}
        </BrowserFrame>
        {badges.map((b, i) => {
          const k = spring({
            frame: frame - Math.round(b.at * fps),
            fps,
            config: { damping: 11, stiffness: 160 },
          })
          if (t < b.at) return null
          const col = b.tone === 'green' ? green : theme.primary
          return (
            <div
              key={i}
              style={{
                position: 'absolute',
                right: 28,
                bottom: 28,
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '14px 30px 14px 22px',
                borderRadius: 999,
                background: col,
                color: '#fff',
                fontSize: 34,
                fontWeight: 700,
                boxShadow: '0 12px 36px rgba(0,0,0,0.28)',
                transform: `scale(${0.4 + k * 0.6})`,
                opacity: Math.min(1, k * 2),
                transformOrigin: 'right bottom',
              }}
            >
              <svg
                width="34"
                height="34"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#fff"
                strokeWidth="3.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M4 12.5l5 5L20 6.5" />
              </svg>
              {b.text}
            </div>
          )
        })}
      </div>
    </AbsoluteFill>
  )
}

const Highlight = ({
  box,
  age,
}: {
  box: { x: number; y: number; width: number; height: number }
  age: number
}) => {
  const frame = useCurrentFrame()
  if (age < -0.05) return null
  const k = Math.min(1, Math.max(0, age / 0.4))
  const pulse = 0.65 + 0.35 * Math.sin(frame / 3.2)
  return (
    <>
      <div
        style={{
          position: 'absolute',
          left: box.x - 6,
          top: box.y - 4,
          width: box.width + 12,
          height: box.height + 8,
          borderRadius: 14,
          border: `5px solid ${dark.red}`,
          background: 'rgba(255,107,94,0.10)',
          boxShadow: `0 0 ${30 * pulse}px rgba(255,107,94,0.7)`,
          opacity: k,
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: box.x + box.width - 250,
          top: box.y - 54,
          padding: '8px 22px',
          borderRadius: 999,
          background: dark.red,
          color: '#fff',
          fontSize: 28,
          fontWeight: 700,
          opacity: k,
          transform: `translateY(${(1 - k) * 12}px)`,
        }}
      >
        En retard
      </div>
    </>
  )
}
