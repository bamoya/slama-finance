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

export const green = '#1f8a5b'

export const Video = ({
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
}: {
  clip: ClipRef
  timeline: Timeline
  caption?: string
}) => {
  const frame = useCurrentFrame()
  const { fps, width, height, durationInFrames } = useVideoConfig()
  const square = width === height
  const t = frame / fps
  const plan = buildPlan(clip, timeline.duration)
  const src = outToSrc(plan, t)
  const cam = cameraAt(buildKeys(timeline), src)

  const frameW = square ? 980 : 1300
  const viewH = frameW * (VIDEO_H / VIDEO_W)
  const base = frameW / VIDEO_W
  const scale = base * cam.s
  const tx = frameW / 2 - cam.cx * scale
  const ty = viewH / 2 - cam.cy * scale
  const top = square ? 250 : 170
  const bottomRoom = height - top - viewH - 46
  const frameTop = Math.min(top, top + bottomRoom / 2)

  const enter = spring({ frame: frame - 2, fps, config: { damping: 200 } })
  const capIn = spring({ frame: frame - 6, fps, config: { damping: 14, stiffness: 110 } })
  const frameIn = spring({ frame: frame - 3, fps, config: { damping: 18, stiffness: 120 } })

  const bg = `radial-gradient(1000px 520px at 15% 0%, ${theme.accentSoft}, transparent 70%), ${theme.background}`

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
              color: theme.ink,
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
            {timeline.events.map((e, i) => (
              <Ring key={i} box={e.box} age={src - e.t} type={e.type} />
            ))}
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
