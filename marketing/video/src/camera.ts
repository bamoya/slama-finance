import { Easing, interpolate } from 'remotion'
import type { Timeline } from './config'

export const VIDEO_W = 1440
export const VIDEO_H = 900
const MAX_ZOOM = 1.12
const SNAP = 200 // a window ending within this many px of the frame edge snaps to it (no sliver of cut text)
const LEAD = 0.4 // seconds the zoom starts before the event
const TRAVEL = 0.7 // seconds a zoom move lasts (ends 0.1 s after the event)
const HOLD = 1.3 // seconds to stay after the event
const MARGIN = 160 // video px kept around the target box

type Key = { time: number; cx: number; cy: number; s: number }

// Zoom so the box (plus margin) is fully inside the window; the window never leaves the recording frame.
const target = (box: Timeline['events'][number]['box']) => {
  const needW = box.width + MARGIN * 2
  const needH = box.height + MARGIN * 2
  const fit = Math.min(VIDEO_W / needW, VIDEO_H / needH)
  const s = Math.max(1, Math.min(MAX_ZOOM, fit))
  const half = { w: VIDEO_W / s / 2, h: VIDEO_H / s / 2 }
  const axis = (start: number, size: number, h: number, total: number) => {
    const c = start + size / 2
    // keep the whole box inside the window when it fits, else keep its start visible
    const lo = start + size + MARGIN - h
    const hi = start - MARGIN + h
    const v = lo <= hi ? Math.min(hi, Math.max(lo, c)) : start - MARGIN + h
    const c2 = Math.min(total - h, Math.max(h, v))
    if (c2 - h < SNAP) return h
    if (total - (c2 + h) < SNAP) return total - h
    return c2
  }
  return { cx: axis(box.x, box.width, half.w, VIDEO_W), cy: axis(box.y, box.height, half.h, VIDEO_H), s }
}

export const buildKeys = (timeline: Timeline): Key[] => {
  const home = { cx: VIDEO_W / 2, cy: VIDEO_H / 2, s: 1 }
  const keys: Key[] = [{ time: 0, ...home }]
  for (const e of timeline.events) {
    if (e.type === 'navigate' || e.type === 'highlight') continue
    const tg = e.box.width > VIDEO_W * 0.7 || e.box.height > VIDEO_H * 0.7 ? home : target(e.box)
    const last = keys[keys.length - 1]
    const start = Math.max(last.time + 0.05, e.t - LEAD)
    keys.push({ ...last, time: start })
    keys.push({ time: start + TRAVEL, ...tg })
    keys.push({ time: Math.max(e.t + HOLD, start + TRAVEL + 0.1), ...tg })
  }
  keys.push({ time: Math.max(timeline.duration, keys[keys.length - 1].time + 1), ...home })
  return keys
}

const ease = Easing.inOut(Easing.quad)

export const cameraAt = (keys: Key[], t: number) => {
  let i = 0
  while (i < keys.length - 2 && t > keys[i + 1].time) i++
  const a = keys[i]
  const b = keys[i + 1]
  const opts = { easing: ease, extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const
  const p = (from: number, to: number) => interpolate(t, [a.time, b.time], [from, to], opts)
  return { cx: p(a.cx, b.cx), cy: p(a.cy, b.cy), s: p(a.s, b.s) }
}
