import { Easing, interpolate } from 'remotion'
import type { Timeline } from './config'

export const VIDEO_W = 1440
export const VIDEO_H = 900
const MAX_ZOOM = 1.6
const LEAD = 0.7 // seconds to travel before the event
const HOLD = 1.6 // seconds to stay after the event

type Key = { time: number; cx: number; cy: number; s: number }

const target = (box: Timeline['events'][number]['box']) => {
  const fit = Math.min(VIDEO_W / (box.width * 2.2), VIDEO_H / (box.height * 3))
  const s = Math.max(1, Math.min(MAX_ZOOM, fit))
  const half = { w: VIDEO_W / s / 2, h: VIDEO_H / s / 2 }
  const cx = Math.min(VIDEO_W - half.w, Math.max(half.w, box.x + box.width / 2))
  const cy = Math.min(VIDEO_H - half.h, Math.max(half.h, box.y + box.height / 2))
  return { cx, cy, s }
}

export const buildKeys = (timeline: Timeline): Key[] => {
  const home = { cx: VIDEO_W / 2, cy: VIDEO_H / 2, s: 1 }
  const keys: Key[] = [{ time: 0, ...home }]
  for (const e of timeline.events) {
    const tg = e.box.width > VIDEO_W * 0.8 ? home : target(e.box)
    const start = Math.max(keys[keys.length - 1].time + 0.05, e.t - LEAD)
    keys.push({ ...keys[keys.length - 1], time: start })
    keys.push({ time: Math.max(start + 0.4, e.t), ...tg })
    keys.push({ time: Math.max(e.t + HOLD, start + 0.5), ...tg })
  }
  keys.push({ time: Math.max(timeline.duration, keys[keys.length - 1].time + 1), ...home })
  return keys
}

const ease = Easing.inOut(Easing.cubic)

export const cameraAt = (keys: Key[], t: number) => {
  let i = 0
  while (i < keys.length - 2 && t > keys[i + 1].time) i++
  const a = keys[i]
  const b = keys[i + 1]
  const opts = { easing: ease, extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const
  const p = (from: number, to: number) => interpolate(t, [a.time, b.time], [from, to], opts)
  return { cx: p(a.cx, b.cx), cy: p(a.cy, b.cy), s: p(a.s, b.s) }
}
