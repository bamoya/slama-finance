// Verifies the film camera on every clip: at each frame (30 fps) the visible cursor and any open popup must be
// fully inside the camera window. Usage: node --experimental-strip-types scripts/camera-check.mjs [clip-prefix]
import fs from 'node:fs'
import { buildKeys, cameraWindow, cursorPositionAt, popupBoxesAt } from '../src/camera.ts'

const dir = new URL('../public/clips/', import.meta.url).pathname
const only = process.argv[2]
let bad = 0
for (const f of fs
  .readdirSync(dir)
  .filter((f) => f.endsWith('.json') && (!only || f.startsWith(only)))) {
  const tl = JSON.parse(fs.readFileSync(dir + f, 'utf8'))
  const keys = buildKeys(tl)
  let worstCursor = Infinity
  let worstPopup = Infinity
  const issues = []
  for (let t = 0; t <= tl.duration; t += 1 / 30) {
    const w = cameraWindow(keys, t)
    const c = cursorPositionAt(tl, t)
    if (c && tl.cursor?.length) {
      const m = Math.min(c.x - w.x0, w.x1 - c.x, c.y - w.y0, w.y1 - c.y)
      worstCursor = Math.min(worstCursor, m)
      if (m < 0) issues.push(`t=${t.toFixed(2)} cursor outside by ${(-m).toFixed(0)}px`)
    }
    const p = popupBoxesAt(tl, t)
    if (p) {
      const m = Math.min(p.x0 - w.x0, w.x1 - p.x1, p.y0 - w.y0, w.y1 - p.y1)
      worstPopup = Math.min(worstPopup, m)
      if (m < -1) issues.push(`t=${t.toFixed(2)} popup outside by ${(-m).toFixed(0)}px`)
    }
  }
  const zooms = keys.filter((k) => k.s > 1.01).length
  console.log(
    `${f}: keys=${keys.length} zoomKeys=${zooms} cursorSamples=${tl.cursor?.length ?? 0} popups=${tl.events.filter((e) => e.type === 'popup' && e.box.width).length} worstCursorMargin=${worstCursor.toFixed(0)} worstPopupMargin=${worstPopup === Infinity ? '-' : worstPopup.toFixed(0)} issues=${issues.length}`,
  )
  for (const i of issues.slice(0, 6)) console.log('   ' + i)
  bad += issues.length
}
process.exitCode = bad ? 1 : 0
