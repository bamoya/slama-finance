import {
  AbsoluteFill,
  Easing,
  interpolate,
  OffthreadVideo,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion'
import { BrowserFrame } from './BrowserFrame'
import { Progress } from './Progress'
import { buildKeys, cameraAt, VIDEO_H, VIDEO_W } from '../camera'
import type { ChapterConfig, Source, Timeline } from '../config'
import { theme } from '../theme'

export type ChapterProps = {
  chapter: ChapterConfig
  index: number
  source: Source
  timeline: Timeline
}

const Ring = ({
  box,
  age,
  type,
}: {
  box: Timeline['events'][number]['box']
  age: number
  type: string
}) => {
  if (age < 0 || age > 1.1) return null
  const cx = box.x + box.width / 2
  const cy = box.y + box.height / 2
  if (type === 'click') {
    const p = Easing.out(Easing.cubic)(Math.min(1, age / 0.9))
    const size = 36 + p * 56
    return (
      <>
        <div
          style={{
            position: 'absolute',
            left: cx - size / 2,
            top: cy - size / 2,
            width: size,
            height: size,
            borderRadius: '50%',
            border: `4px solid ${theme.primary}`,
            background: 'rgba(148,111,41,0.12)',
            opacity: 1 - p * 0.9,
          }}
        />
        <div
          style={{
            position: 'absolute',
            left: cx - 9,
            top: cy - 9,
            width: 18,
            height: 18,
            borderRadius: '50%',
            background: theme.primary,
            opacity: 0.55 * (1 - p),
          }}
        />
      </>
    )
  }
  if (type === 'type') {
    const o = interpolate(age, [0, 0.2, 0.9, 1.1], [0, 1, 1, 0], { extrapolateRight: 'clamp' })
    return (
      <div
        style={{
          position: 'absolute',
          left: box.x - 8,
          top: box.y - 8,
          width: box.width + 16,
          height: box.height + 16,
          borderRadius: 12,
          border: `3px solid ${theme.primary}`,
          opacity: 0.7 * o,
        }}
      />
    )
  }
  return null
}

export const Chapter = ({ chapter, index, source, timeline }: ChapterProps) => {
  const frame = useCurrentFrame()
  const { fps, width, height, durationInFrames } = useVideoConfig()
  const square = width === height
  const t = frame / fps
  const keys = buildKeys(timeline)
  const cam = cameraAt(keys, t)

  const frameW = square ? 960 : 1120
  const viewH = frameW * (VIDEO_H / VIDEO_W)
  const base = frameW / VIDEO_W
  const scale = base * cam.s
  const tx = frameW / 2 - cam.cx * scale
  const ty = viewH / 2 - cam.cy * scale

  const enter = spring({ frame: frame - 4, fps, config: { damping: 200 } })
  const subEnter = spring({ frame: frame - 14, fps, config: { damping: 200 } })
  const out = interpolate(frame, [durationInFrames - 10, durationInFrames], [1, 0], {
    extrapolateLeft: 'clamp',
  })
  const frameIn = spring({ frame: frame - 2, fps, config: { damping: 200 } })

  return (
    <AbsoluteFill style={{ background: theme.background, fontFamily: theme.font }}>
      <AbsoluteFill
        style={{
          background: `radial-gradient(900px 500px at 15% 0%, ${theme.accentSoft}, transparent 70%)`,
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: square ? 56 : 52,
          textAlign: square ? 'center' : 'left',
          padding: square ? '0 60px' : `0 ${(width - frameW) / 2}px`,
          opacity: out,
        }}
      >
        <div
          style={{
            fontSize: 18,
            fontWeight: 600,
            letterSpacing: 2,
            textTransform: 'uppercase',
            color: theme.primary,
            opacity: enter,
          }}
        >
          Étape {index + 1}
        </div>
        <div
          style={{
            fontSize: square ? 50 : 56,
            fontWeight: 700,
            color: theme.ink,
            letterSpacing: -1,
            marginTop: 6,
            transform: `translateY(${(1 - enter) * 22}px)`,
            opacity: enter,
            lineHeight: 1.1,
          }}
        >
          {chapter.title}
        </div>
        <div
          style={{
            fontSize: square ? 25 : 28,
            color: theme.body,
            marginTop: 10,
            transform: `translateY(${(1 - subEnter) * 16}px)`,
            opacity: subEnter,
          }}
        >
          {chapter.subtitle}
        </div>
      </div>
      <div
        style={{
          position: 'absolute',
          left: (width - frameW) / 2,
          top: square ? 262 : 228,
          opacity: frameIn * out,
          transform: `translateY(${(1 - frameIn) * 30}px)`,
        }}
      >
        <BrowserFrame host={chapter.host} width={frameW} height={viewH}>
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
            <OffthreadVideo
              src={staticFile(source.video)}
              muted
              style={{ width: VIDEO_W, height: VIDEO_H }}
            />
            {timeline.events.map((e, i) => (
              <Ring key={i} box={e.box} age={t - e.t} type={e.type} />
            ))}
          </div>
        </BrowserFrame>
      </div>
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: square ? 60 : 34,
          display: 'flex',
          justifyContent: 'center',
          opacity: out,
        }}
      >
        <Progress index={index} />
      </div>
    </AbsoluteFill>
  )
}
