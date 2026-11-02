// Prints the film timeline (scene -> start / duration) and, for clip scenes, where source times land in the film.
// Usage: node --experimental-strip-types scripts/film-timeline.mjs [cutdown]
import fs from 'node:fs'
import { buildPlan, planDuration, srcToOut } from '../src/film/plan.ts'
import { CUTDOWNS, FADE_FRAMES, FILM_FPS, HOLD_TAIL, SCENES } from '../src/film/storyboard.ts'

const cut = process.argv[2]
const tl = (id) =>
  JSON.parse(fs.readFileSync(new URL(`../public/clips/${id}.json`, import.meta.url), 'utf8'))
const list = cut
  ? CUTDOWNS[cut].scenes.map((c) => {
      const base = SCENES.find((s) => s.id === c.scene)
      return {
        scene: c.keep && base.clip ? { ...base, clip: { ...base.clip, keep: c.keep } } : base,
        seconds: c.seconds,
      }
    })
  : SCENES.map((scene) => ({ scene }))
let at = 0
list.forEach((c, i) => {
  const s = c.scene
  const intro = s.questionSeconds ?? 0
  const clips = s.clip ? [s.clip] : s.kind === 'compare' ? [s.left.clip, s.right.clip] : []
  const auto = clips.length
    ? intro +
      Math.max(...clips.map((c) => planDuration(buildPlan(c, tl(c.id).duration)))) +
      HOLD_TAIL
    : 3
  const sec = c.seconds ?? s.seconds ?? auto
  const frames = Math.round(sec * FILM_FPS) + (i < list.length - 1 ? FADE_FRAMES : 0)
  console.log(
    `${s.id.padEnd(14)} start ${at.toFixed(2).padStart(7)}s  dur ${sec.toFixed(2).padStart(6)}s`,
  )
  s.clip?.keep?.length &&
    console.log(
      '   ' +
        tl(s.clip.id)
          .events.filter(
            (e) => e.type === 'click' && s.clip.keep.some((k) => e.t >= k.from && e.t <= k.to),
          )
          .slice(0, 40)
          .map(
            (e) =>
              `${e.label.slice(0, 18)}@${(at + intro + srcToOut(buildPlan(s.clip, tl(s.clip.id).duration), e.t)).toFixed(1)}`,
          )
          .join('  '),
    )
  at += (frames - FADE_FRAMES) / FILM_FPS
})
console.log(`TOTAL ${(at + FADE_FRAMES / FILM_FPS).toFixed(2)}s`)
