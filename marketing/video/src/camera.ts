import { Easing, interpolate } from 'remotion'
import type { Timeline } from './config'

export const VIDEO_W = 1440
export const VIDEO_H = 900
const MAX_ZOOM = 1.12
const MIN_ZOOM = 1.04 // below this a zoom is pointless: stay on the full frame
const SNAP = 200 // a window ending within this many px of the frame edge snaps to it (when nothing gets cut)
const LEAD = 0.45 // seconds the zoom starts before the first event of a group
const VIA = 0.4 // extra lead when the move has to go through the full frame
const TRAVEL = 0.7 // seconds a zoom move lasts
const HOLD = 1.1 // seconds to stay after the last event of a group
const GAP = 2.0 // events closer than this (s) are framed together
const BOX_MARGIN = 120 // video px kept around a target box
const CURSOR_MARGIN = 100 // ... around the cursor
const POPUP_MARGIN = 36 // ... around an open popup
const CHECK_MARGIN = 30 // the cursor / popup must stay at least this far inside the window

type Key = { time: number; cx: number; cy: number; s: number }
type Rect = { x0: number; y0: number; x1: number; y1: number }
type Event = Timeline['events'][number]

const HOME: Omit<Key, 'time'> = { cx: VIDEO_W / 2, cy: VIDEO_H / 2, s: 1 }
const ease = Easing.inOut(Easing.quad)

const grow = (r: Rect, m: number): Rect => ({
  x0: r.x0 - m,
  y0: r.y0 - m,
  x1: r.x1 + m,
  y1: r.y1 + m,
})
const union = (a: Rect | null, b: Rect): Rect =>
  a
    ? {
        x0: Math.min(a.x0, b.x0),
        y0: Math.min(a.y0, b.y0),
        x1: Math.max(a.x1, b.x1),
        y1: Math.max(a.y1, b.y1),
      }
    : b
const boxRect = (b: Event['box']): Rect => ({
  x0: b.x,
  y0: b.y,
  x1: b.x + b.width,
  y1: b.y + b.height,
})
const winRect = (k: Omit<Key, 'time'>): Rect => ({
  x0: k.cx - VIDEO_W / k.s / 2,
  y0: k.cy - VIDEO_H / k.s / 2,
  x1: k.cx + VIDEO_W / k.s / 2,
  y1: k.cy + VIDEO_H / k.s / 2,
})
const inside = (w: Rect, r: Rect, m = 0) =>
  r.x0 >= w.x0 + m - 0.5 &&
  r.y0 >= w.y0 + m - 0.5 &&
  r.x1 <= w.x1 - m + 0.5 &&
  r.y1 <= w.y1 - m + 0.5
const fitZoom = (r: Rect) => Math.min(VIDEO_W / (r.x1 - r.x0), VIDEO_H / (r.y1 - r.y0), MAX_ZOOM)

/** Window containing `need` (clamped inside the recording frame), or null if it would need less than MIN_ZOOM. */
const frameFor = (need: Rect): Omit<Key, 'time'> | null => {
  const r: Rect = {
    x0: Math.max(0, need.x0),
    y0: Math.max(0, need.y0),
    x1: Math.min(VIDEO_W, need.x1),
    y1: Math.min(VIDEO_H, need.y1),
  }
  const s = fitZoom(r)
  if (s < MIN_ZOOM) return null
  const hw = VIDEO_W / s / 2
  const hh = VIDEO_H / s / 2
  const clampC = (c: number, h: number, total: number) => Math.min(total - h, Math.max(h, c))
  let cx = clampC((r.x0 + r.x1) / 2, hw, VIDEO_W)
  let cy = clampC((r.y0 + r.y1) / 2, hh, VIDEO_H)
  // snap to a frame edge when that keeps everything inside (no sliver of cut content)
  const snapped = (c: number, h: number, total: number, lo: number, hi: number) => {
    if (c - h < SNAP && hi <= h * 2) return h
    if (total - (c + h) < SNAP && lo >= total - h * 2) return total - h
    return c
  }
  cx = snapped(cx, hw, VIDEO_W, r.x0, r.x1)
  cy = snapped(cy, hh, VIDEO_H, r.y0, r.y1)
  return { cx, cy, s }
}

// ---- timeline data: cursor path and popups ----------------------------------------------------------------------

/** Cursor position at t: recorded samples, else straight lines between the centres of the events' boxes. */
const cursorPoints = (timeline: Timeline): [number, number, number][] => {
  if (timeline.cursor?.length) return timeline.cursor
  return timeline.events
    .filter((e) => e.type === 'click' || e.type === 'type')
    .map(
      (e) =>
        [e.t, e.box.x + e.box.width / 2, e.box.y + e.box.height / 2] as [number, number, number],
    )
}
const cursorAt = (pts: [number, number, number][], t: number) => {
  if (!pts.length) return null
  if (t <= pts[0][0]) return { x: pts[0][1], y: pts[0][2] }
  for (let i = 1; i < pts.length; i++)
    if (t <= pts[i][0]) {
      const [t0, x0, y0] = pts[i - 1]
      const [t1, x1, y1] = pts[i]
      const k = t1 > t0 ? (t - t0) / (t1 - t0) : 1
      return { x: x0 + (x1 - x0) * k, y: y0 + (y1 - y0) * k }
    }
  const l = pts[pts.length - 1]
  return { x: l[1], y: l[2] }
}
/** Union of the cursor positions over [a, b] (samples inside plus the interpolated ends). */
const cursorSpan = (pts: [number, number, number][], a: number, b: number): Rect | null => {
  let r: Rect | null = null
  const add = (p: { x: number; y: number } | null) => {
    if (p) r = union(r, { x0: p.x, y0: p.y, x1: p.x, y1: p.y })
  }
  add(cursorAt(pts, a))
  add(cursorAt(pts, b))
  for (const [t, x, y] of pts) if (t > a && t < b) add({ x, y })
  return r
}
/** Union of the popups that are open at some moment of [a, b]. */
const popupSpan = (timeline: Timeline, a: number, b: number): Rect | null => {
  const ps = timeline.events.filter((e) => e.type === 'popup').sort((p, q) => p.t - q.t)
  let r: Rect | null = null
  ps.forEach((p, i) => {
    const end = ps[i + 1]?.t ?? timeline.duration
    if (p.box.width > 0 && p.t < b && end > a) r = union(r, boxRect(p.box))
  })
  return r
}

// ---- groups of events -------------------------------------------------------------------------------------------

type Group = { t0: number; t1: number; events: Event[]; home: boolean; win: Omit<Key, 'time'> }

const isHome = (e: Event) =>
  e.type === 'navigate' || e.box.width > VIDEO_W * 0.7 || e.box.height > VIDEO_H * 0.7

const needOf = (
  timeline: Timeline,
  cur: [number, number, number][],
  evs: Event[],
  until: number,
): Rect => {
  const t0 = evs[0].t
  const t1 = evs[evs.length - 1].t
  let need: Rect | null = null
  for (const e of evs) need = union(need, grow(boxRect(e.box), BOX_MARGIN))
  const c = cursorSpan(cur, t0 - 0.6, until)
  if (c) need = union(need, grow(c, CURSOR_MARGIN))
  const p = popupSpan(timeline, t0 - 0.2, Math.max(t1, until))
  if (p) need = union(need, grow(p, POPUP_MARGIN))
  return need!
}

export const buildKeys = (timeline: Timeline): Key[] => {
  const cur = cursorPoints(timeline)
  const evs = timeline.events.filter((e) => e.type !== 'highlight' && e.type !== 'popup')
  // 1. cluster consecutive small events that are close in time and that fit one window together
  const clusters: Event[][] = []
  for (const e of evs) {
    const last = clusters[clusters.length - 1]
    if (e.type === 'navigate' || isHome(e) || !last || isHome(last[0])) {
      clusters.push([e])
      continue
    }
    const gapOk = e.t - last[last.length - 1].t <= GAP
    const next = [...last, e]
    const fits = gapOk && frameFor(needOf(timeline, cur, next, e.t + HOLD)) !== null
    if (fits) last.push(e)
    else clusters.push([e])
  }
  // 2. window per cluster (until the next cluster starts moving); a cluster that cannot be framed stays on the full frame
  const groups: Group[] = clusters.map((c, i) => {
    const t0 = c[0].t
    const t1 = c[c.length - 1].t
    if (isHome(c[0])) return { t0, t1, events: c, home: true, win: HOME }
    const nextStart = clusters[i + 1] ? clusters[i + 1][0].t - LEAD - VIA : timeline.duration
    const until = Math.max(t1 + HOLD, Math.min(nextStart, t1 + HOLD + 1.5))
    const win = frameFor(needOf(timeline, cur, c, until))
    return { t0, t1, events: c, home: !win, win: win ?? HOME }
  })
  // 3. keyframes
  const keys: Key[] = [{ time: 0, ...HOME }]
  for (const g of groups) {
    const last = keys[keys.length - 1]
    let start = Math.max(last.time + 0.05, g.t0 - LEAD)
    const sameAsLast =
      Math.abs(last.cx - g.win.cx) < 2 &&
      Math.abs(last.cy - g.win.cy) < 2 &&
      Math.abs(last.s - g.win.s) < 0.003
    if (sameAsLast) {
      keys.push({ ...last, time: Math.max(last.time + 0.05, g.t1 + HOLD) })
      continue
    }
    // try the direct move; if the cursor would leave the moving window, go through the full frame
    const direct: Key[] = [
      { ...last, time: start },
      { time: start + TRAVEL, ...g.win },
    ]
    const trial = [...keys, ...direct]
    let leaves = false
    for (let i = 0; i <= 14; i++) {
      const t = start + (TRAVEL * i) / 14
      const c = cursorAt(cur, t)
      if (!c) continue
      const w = winRect(cameraAt(trial, t))
      if (!inside(w, { x0: c.x, y0: c.y, x1: c.x, y1: c.y }, CHECK_MARGIN)) leaves = true
    }
    if (leaves && !(last.s === 1 && g.home)) {
      start = Math.max(last.time + 0.05, g.t0 - LEAD - VIA)
      const half = TRAVEL * 0.55
      keys.push({ ...last, time: start })
      if (last.s !== 1) keys.push({ time: start + half, ...HOME })
      if (g.win.s !== 1) {
        keys.push({ time: start + half + 0.05, ...HOME })
        keys.push({ time: start + half + 0.05 + TRAVEL * 0.7, ...g.win })
      } else if (last.s === 1) keys.push({ time: start + TRAVEL, ...g.win })
    } else {
      keys.push(...direct)
    }
    const end = keys[keys.length - 1]
    keys.push({ ...end, time: Math.max(g.t1 + HOLD, end.time + 0.1) })
  }
  const end = keys[keys.length - 1]
  if (end.s !== 1) {
    keys.push({ ...end, time: Math.max(timeline.duration - 0.8, end.time + 0.05) })
    keys.push({ time: Math.max(timeline.duration, end.time + 0.9), ...HOME })
  } else keys.push({ ...end, time: Math.max(timeline.duration, end.time + 0.5) })
  return keys
}

export const cameraAt = (keys: Key[], t: number) => {
  let i = 0
  while (i < keys.length - 2 && t > keys[i + 1].time) i++
  const a = keys[i]
  const b = keys[i + 1]
  const opts = { easing: ease, extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const
  if (b.time <= a.time) return { cx: b.cx, cy: b.cy, s: b.s }
  const p = (from: number, to: number) => interpolate(t, [a.time, b.time], [from, to], opts)
  return { cx: p(a.cx, b.cx), cy: p(a.cy, b.cy), s: p(a.s, b.s) }
}

/** Debug / verification: the window rect of the camera at t. */
export const cameraWindow = (keys: Key[], t: number) => winRect(cameraAt(keys, t))
export const cursorPositionAt = (timeline: Timeline, t: number) =>
  cursorAt(cursorPoints(timeline), t)
export const popupBoxesAt = (timeline: Timeline, t: number): Rect | null =>
  popupSpan(timeline, t, t + 0.001)
