import type { ClipRef } from './storyboard'

export type Piece = { from: number; to: number; rate: number; outStart: number; outDur: number } // seconds

/** Split a clip into constant-rate pieces (speed-ups) laid back to back on the output timeline. */
export const buildPlan = (clip: ClipRef, duration: number): Piece[] => {
  if (clip.keep?.length) {
    // explicit ordered pieces (jump cuts allowed)
    let at = 0
    return clip.keep.map((k) => {
      const outDur = (k.to - k.from) / k.rate
      const piece = { from: k.from, to: k.to, rate: k.rate, outStart: at, outDur }
      at += outDur
      return piece
    })
  }
  const [a, b] = clip.trim ?? [0, duration]
  const cuts = new Set<number>([a, b])
  for (const s of clip.speed ?? []) {
    if (s.from > a && s.from < b) cuts.add(s.from)
    if (s.to > a && s.to < b) cuts.add(s.to)
  }
  const pts = [...cuts].sort((x, y) => x - y)
  const pieces: Piece[] = []
  let out = 0
  for (let i = 0; i < pts.length - 1; i++) {
    const from = pts[i]
    const to = pts[i + 1]
    const mid = (from + to) / 2
    const rate = (clip.speed ?? []).find((s) => mid >= s.from && mid <= s.to)?.rate ?? 1
    const outDur = (to - from) / rate
    pieces.push({ from, to, rate, outStart: out, outDur })
    out += outDur
  }
  return pieces
}

export const planDuration = (plan: Piece[]) => plan.reduce((n, p) => n + p.outDur, 0)

/** Source seconds -> output seconds (clamped to the plan). */
export const srcToOut = (plan: Piece[], t: number) => {
  for (const p of plan) if (t >= p.from && t <= p.to) return p.outStart + (t - p.from) / p.rate
  const next = plan.find((p) => p.from > t)
  return next ? next.outStart : planDuration(plan)
}

/** Output seconds -> source seconds (holds the last frame beyond the plan). */
export const outToSrc = (plan: Piece[], t: number) => {
  for (const p of plan) if (t < p.outStart + p.outDur) return p.from + Math.max(0, t - p.outStart) * p.rate
  const last = plan[plan.length - 1]
  return last.to
}
