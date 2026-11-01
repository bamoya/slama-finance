import { AbsoluteFill, interpolate, Sequence } from 'remotion'
import type { CalculateMetadataFunction } from 'remotion'
import { staticFile } from 'remotion'
import type { Timeline } from '../config'
import { IntroCard, OutroCard, QuestionCard } from './Cards'
import { ClipScene } from './ClipScene'
import { buildPlan, planDuration } from './plan'
import { CUTDOWNS, FADE_FRAMES, FILM_FPS, HOLD_TAIL, SCENES, type Scene, type Speed } from './storyboard'

export type FilmProps = { scenes: { scene: Scene; frames: number; mini?: boolean }[]; timelines: Record<string, Timeline> }

const sceneClip = (s: Scene) => ('clip' in s ? s.clip : null)

/** Resolve the ordered scene list for a composition (full film or cut-down) with frame lengths. */
const resolve = (timelines: Record<string, Timeline>, cutdown?: string): { scene: Scene; frames: number; mini?: boolean }[] => {
  const withKeep = (c: { scene: string; keep?: Speed[] }): Scene => {
    const base = SCENES.find((s) => s.id === c.scene)!
    return c.keep && 'clip' in base ? ({ ...base, clip: { ...base.clip, keep: c.keep } } as Scene) : base
  }
  const list = cutdown
    ? CUTDOWNS[cutdown].scenes.map((c) => ({ scene: withKeep(c), seconds: c.seconds, mini: c.mini }))
    : SCENES.map((scene) => ({ scene, seconds: undefined as number | undefined, mini: false }))
  return list.map((c, i) => {
    const clip = sceneClip(c.scene)
    const intro = 'questionSeconds' in c.scene ? c.scene.questionSeconds : 0
    const auto = clip ? intro + planDuration(buildPlan(clip, timelines[clip.id].duration)) + HOLD_TAIL : 3
    const seconds = c.seconds ?? c.scene.seconds ?? auto
    // each scene is extended by the crossfade so the next one fades in over its tail
    return { scene: c.scene, mini: c.mini, frames: Math.round(seconds * FILM_FPS) + (i < list.length - 1 ? FADE_FRAMES : 0) }
  })
}

const neededClips = (cutdown?: string) =>
  [...new Set((cutdown ? CUTDOWNS[cutdown].scenes.map((c) => SCENES.find((s) => s.id === c.scene)!) : SCENES).flatMap((s) => (sceneClip(s) ? [sceneClip(s)!.id] : [])))]

export const filmMeta =
  (cutdown?: string): CalculateMetadataFunction<FilmProps> =>
  async () => {
    const timelines: Record<string, Timeline> = {}
    for (const id of neededClips(cutdown)) timelines[id] = (await (await fetch(staticFile(`clips/${id}.json`))).json()) as Timeline
    const scenes = resolve(timelines, cutdown)
    for (const { scene, frames } of scenes) {
      const clip = sceneClip(scene)
      if (!clip) continue
      const need = planDuration(buildPlan(clip, timelines[clip.id].duration)) * FILM_FPS
      const have = frames - ('questionSeconds' in scene ? scene.questionSeconds * FILM_FPS : 0)
      if (need > have + 3) console.warn(`[film] ${scene.id}: clip needs ${(need / FILM_FPS).toFixed(1)}s but scene has ${(have / FILM_FPS).toFixed(1)}s (cut off)`)
    }
    const total = scenes.reduce((n, s) => n + s.frames, 0) - FADE_FRAMES * (scenes.length - 1)
    return { durationInFrames: total, props: { scenes, timelines } }
  }

const Body = ({ scene, timelines, mini, frames }: { scene: Scene; timelines: Record<string, Timeline>; mini?: boolean; frames: number }) => {
  switch (scene.kind) {
    case 'intro':
      return <IntroCard title={scene.title} subtitle={scene.subtitle} />
    case 'outro':
      return <OutroCard title={scene.title} cta={scene.cta} mini={mini} />
    case 'question':
      return <QuestionCard text={scene.text} />
    case 'clip':
      return <ClipScene clip={scene.clip} timeline={timelines[scene.clip.id]} caption={scene.caption} />
    case 'problem':
      return <ClipScene clip={scene.clip} timeline={timelines[scene.clip.id]} title={scene.title} mood="dark" />
    case 'ask-clip': {
      const q = Math.round(scene.questionSeconds * FILM_FPS)
      return (
        <>
          <Sequence durationInFrames={q}>
            <QuestionCard text={scene.text} />
          </Sequence>
          <Sequence from={q} durationInFrames={frames - q}>
            <ClipScene clip={scene.clip} timeline={timelines[scene.clip.id]} caption={scene.caption} />
          </Sequence>
        </>
      )
    }
  }
}

export const Film = ({ scenes, timelines }: FilmProps) => {
  let start = 0
  return (
    <AbsoluteFill style={{ background: '#fff' }}>
      {scenes.map((s, i) => {
        const from = start
        start += s.frames - FADE_FRAMES
        return (
          <Sequence key={i} from={from} durationInFrames={s.frames} name={s.scene.id}>
            <Fade first={i === 0}>
              <Body scene={s.scene} timelines={timelines} mini={s.mini} frames={s.frames} />
            </Fade>
          </Sequence>
        )
      })}
    </AbsoluteFill>
  )
}

import { useCurrentFrame } from 'remotion'
const Fade = ({ first, children }: { first: boolean; children: React.ReactNode }) => {
  const frame = useCurrentFrame()
  const o = first ? 1 : interpolate(frame, [0, FADE_FRAMES], [0, 1], { extrapolateRight: 'clamp' })
  return <AbsoluteFill style={{ opacity: o }}>{children}</AbsoluteFill>
}
