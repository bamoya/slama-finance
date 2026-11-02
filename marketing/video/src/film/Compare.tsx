import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion'
import { BrowserFrame } from '../components/BrowserFrame'
import { VIDEO_H, VIDEO_W } from '../camera'
import type { Timeline } from '../config'
import { theme } from '../theme'
import { Video } from './ClipScene'
import { buildPlan, outToSrc } from './plan'
import type { CompareSide, CompareView } from './storyboard'

/** Source-pixel window (x, y, width) of a side at source time t: eased between the keyframes. */
const viewAt = (views: CompareView[], t: number) => {
  if (t <= views[0].t) return views[0]
  for (let i = 1; i < views.length; i++) {
    const a = views[i - 1]
    const b = views[i]
    if (t <= b.t) {
      const k = interpolate(t, [a.t, b.t], [0, 1])
      const e = k * k * (3 - 2 * k)
      return {
        x: a.x + (b.x - a.x) * e,
        y: a.y + (b.y - a.y) * e,
        w: a.w + (b.w - a.w) * e,
      }
    }
  }
  return views[views.length - 1]
}

const Side = ({
  side,
  timeline,
  width,
  viewH,
  appear,
  square,
}: {
  side: CompareSide
  timeline: Timeline
  width: number
  viewH: number
  appear: number
  square: boolean
}) => {
  const frame = useCurrentFrame()
  const { fps, durationInFrames } = useVideoConfig()
  const plan = buildPlan(side.clip, timeline.duration)
  const src = outToSrc(plan, frame / fps)
  const v = viewAt((square ? side.viewSquare : side.view) ?? side.view, src)
  const scale = width / v.w
  return (
    <div
      style={{
        width,
        opacity: appear,
        transform: `translateY(${(1 - appear) * 40}px) scale(${0.96 + appear * 0.04})`,
      }}
    >
      <div
        style={{
          fontSize: square ? 30 : 36,
          fontWeight: 700,
          color: theme.ink,
          marginBottom: 14,
          textAlign: 'center',
          letterSpacing: -0.5,
        }}
      >
        {side.label}
        <span style={{ color: theme.primary }}> · {side.role}</span>
      </div>
      <BrowserFrame host={side.clip.host} width={width} height={viewH}>
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: VIDEO_W,
            height: VIDEO_H,
            transformOrigin: '0 0',
            transform: `translate(${-v.x * scale}px, ${-v.y * scale}px) scale(${scale})`,
          }}
        >
          <Video clip={side.clip} plan={plan} endFrame={durationInFrames} />
        </div>
      </BrowserFrame>
    </div>
  )
}

export const CompareScene = ({
  left,
  right,
  caption,
  timelines,
}: {
  left: CompareSide
  right: CompareSide
  caption: string
  timelines: Record<string, Timeline>
}) => {
  const frame = useCurrentFrame()
  const { fps, width, height } = useVideoConfig()
  const square = width === height
  const capIn = spring({ frame: frame - 6, fps, config: { damping: 14, stiffness: 110 } })
  const a = spring({ frame: frame - 3, fps, config: { damping: 18, stiffness: 120 } })
  const b = spring({ frame: frame - 12, fps, config: { damping: 18, stiffness: 120 } })
  const gap = square ? 24 : 44
  const fw = square ? 500 : 880
  const viewH = square ? 700 : 690
  const top = square ? 215 : 205
  const bg = `radial-gradient(1000px 520px at 15% 0%, ${theme.accentSoft}, transparent 70%), ${theme.background}`
  return (
    <AbsoluteFill style={{ background: bg, fontFamily: theme.font }}>
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: square ? 50 : 38,
          padding: '0 50px',
          textAlign: 'center',
        }}
      >
        <div
          style={{
            display: 'inline-block',
            fontSize: square ? 46 : 58,
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
      <div
        style={{
          position: 'absolute',
          left: (width - (2 * fw + gap)) / 2,
          top: top - (square ? 56 : 62),
          display: 'flex',
          gap,
        }}
      >
        <Side
          side={left}
          timeline={timelines[left.clip.id]}
          width={fw}
          viewH={viewH}
          appear={a}
          square={square}
        />
        <Side
          side={right}
          timeline={timelines[right.clip.id]}
          width={fw}
          viewH={viewH}
          appear={b}
          square={square}
        />
      </div>
    </AbsoluteFill>
  )
}
