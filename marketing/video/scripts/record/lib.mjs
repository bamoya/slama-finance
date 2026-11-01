// Shared helpers for chapter recordings: Playwright session, visible cursor, timeline, inbox frame, ffmpeg.
import { chromium } from '/Users/bassim/HerdIQ/node_modules/.pnpm/playwright@1.59.1/node_modules/playwright/index.mjs'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const HERE = path.dirname(fileURLToPath(import.meta.url))
export const OUT = path.resolve(HERE, '../../public/recordings')
export const RAW = path.join(OUT, 'raw')
export const PORT = 5174
export const HOSTS = {
  public: `http://localhost:${PORT}`,
  owner: `http://app.localhost:${PORT}`,
  org: (slug) => `http://${slug}.localhost:${PORT}`,
}
export const MAILPIT = 'http://localhost:8025'
export const EXE =
  process.env.CHROMIUM ||
  path.join(
    os.homedir(),
    'Library/Caches/ms-playwright/chromium-1208/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
  )
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
export const W = 1440
export const H = 900

const CURSOR_JS = `(() => {
  if (window.__cursorInstalled) return; window.__cursorInstalled = true
  const install = () => {
    if (!document.body) return requestAnimationFrame(install)
    const c = document.createElement('div')
    c.id = '__cursor'
    c.style.cssText = 'position:fixed;left:0;top:0;width:28px;height:28px;z-index:2147483647;pointer-events:none;transform:translate(-100px,-100px);transition:none'
    c.innerHTML = '<svg width="28" height="28" viewBox="0 0 28 28" style="filter:drop-shadow(0 2px 3px rgba(0,0,0,.35))"><path d="M5 3 L5 22 L10 17.5 L13.5 25 L17 23.5 L13.6 16.2 L20 16 Z" fill="#111" stroke="#fff" stroke-width="1.8" stroke-linejoin="round"/></svg>'
    document.body.appendChild(c)
    // heartbeat: a repaint every 40 ms keeps the screencast delivering frames (the video starts at page load, not at the first change)
    const hb = document.createElement('div')
    hb.style.cssText = 'position:fixed;right:0;bottom:0;width:2px;height:2px;z-index:2147483645;pointer-events:none'
    document.body.appendChild(hb)
    let k = 0
    setInterval(() => { hb.style.background = (k++ % 2) ? 'rgba(0,0,0,0.02)' : 'rgba(255,255,255,0.02)' }, 40)
    const move = (x, y) => { c.style.transform = 'translate(' + (x - 5) + 'px,' + (y - 3) + 'px)'; try { sessionStorage.__cur = x + ',' + y } catch {} }
    try { const p = (sessionStorage.__cur || '').split(',').map(Number); if (p.length === 2 && !isNaN(p[0])) move(p[0], p[1]) } catch {}
    window.addEventListener('mousemove', (e) => move(e.clientX, e.clientY), true)
    window.addEventListener('mousedown', (e) => {
      const r = document.createElement('div')
      r.style.cssText = 'position:fixed;z-index:2147483646;pointer-events:none;border-radius:50%;border:3px solid rgba(138,101,40,.9);background:rgba(138,101,40,.18);width:14px;height:14px;left:' + (e.clientX - 7) + 'px;top:' + (e.clientY - 7) + 'px;transition:all .55s ease-out;opacity:1'
      document.body.appendChild(r)
      requestAnimationFrame(() => requestAnimationFrame(() => { r.style.width = '64px'; r.style.height = '64px'; r.style.left = (e.clientX - 32) + 'px'; r.style.top = (e.clientY - 32) + 'px'; r.style.opacity = '0' }))
      setTimeout(() => r.remove(), 700)
    }, true)
  }
  install()
})()`

const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)

/** Open a recorded browser session. `storageState` optional (path or object). */
export async function openSession(
  chapter,
  { storageState, locale = 'fr-FR', outDir = OUT, webm = true } = {},
) {
  fs.mkdirSync(RAW, { recursive: true })
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `rec-${chapter}-`))
  const browser = await chromium.launch({ executablePath: EXE, args: ['--hide-scrollbars'] })
  const context = await browser.newContext({
    viewport: { width: W, height: H },
    deviceScaleFactor: 1,
    locale,
    colorScheme: 'light',
    storageState,
    recordVideo: { dir: tmp, size: { width: W, height: H } },
  })
  await context.addInitScript(() => {
    try {
      localStorage.setItem('theme', 'light')
      localStorage.setItem('b-finance-theme', 'light')
    } catch {}
  })
  await context.addInitScript(CURSOR_JS)
  const created = Date.now()
  const page = await context.newPage()
  const rec = new Recorder({ chapter, browser, context, page, tmp, created, outDir, webm })
  page.on('framenavigated', async (f) => {
    if (f === page.mainFrame()) rec.restoreMouse().catch(() => {})
  })
  return rec
}

class Recorder {
  constructor(o) {
    Object.assign(this, o)
    this.events = []
    this.cuts = []
    this.t0 = null
    this.pos = { x: W / 2, y: H / 2 }
  }
  now() {
    return this.t0 ? +((Date.now() - this.t0) / 1000).toFixed(2) : 0
  }
  /**
   * Mark the start of the timeline (call once the first screen is fully ready). A full-screen magenta flash is shown
   * and removed; its disappearance in the raw video is detected in finish() so the video trim and the timeline share
   * exactly the same origin (t = 0 at the removal of the flash).
   */
  async start() {
    if (this.t0) return
    // the video only starts ~2.2 s after the page is created (recorder warm-up): flash well after that
    await sleep(Math.max(0, 4000 - (Date.now() - this.created)))
    await this.page.evaluate(() => {
      const d = document.createElement('div')
      d.id = '__sync'
      d.style.cssText = 'position:fixed;inset:0;background:#ff00ff;z-index:2147483647'
      document.documentElement.appendChild(d)
    })
    await sleep(500)
    await this.page.evaluate(() => document.getElementById('__sync')?.remove())
    this.t0 = Date.now()
    this.synced = true
  }
  /** Run `fn` but remove that stretch (e.g. the boring middle of a wizard) from the final video and timeline. */
  async cut(fn) {
    const a = this.now()
    await fn()
    this.cuts.push([a, this.now()])
  }
  push(type, label, box) {
    if (!this.t0) this.t0 = Date.now()
    const e = { t: this.now(), type, label }
    if (box)
      e.box = {
        x: Math.round(box.x),
        y: Math.round(box.y),
        width: Math.round(box.width),
        height: Math.round(box.height),
      }
    this.events.push(e)
  }
  async restoreMouse() {
    await this.page.mouse.move(this.pos.x, this.pos.y).catch(() => {})
  }
  loc(target) {
    return typeof target === 'string' ? this.page.locator(target).first() : target
  }
  async boxOf(target) {
    const l = this.loc(target)
    await l.waitFor({ state: 'visible', timeout: 20000 }).catch(async (e) => {
      await this.page
        .screenshot({ path: `/private/tmp/claude-503/demo/fail-${this.chapter}.png` })
        .catch(() => {})
      throw e
    })
    await l.scrollIntoViewIfNeeded().catch(() => {})
    await sleep(120)
    return await l.boundingBox()
  }
  async moveTo(x, y, ms) {
    const dx = x - this.pos.x,
      dy = y - this.pos.y
    const dist = Math.hypot(dx, dy)
    const dur = (ms ?? Math.min(600, 200 + dist * 0.35)) * (this.mv ?? 1)
    const steps = Math.max(8, Math.round(dur / 16))
    const sx = this.pos.x,
      sy = this.pos.y
    for (let i = 1; i <= steps; i++) {
      const k = ease(i / steps)
      await this.page.mouse.move(sx + dx * k, sy + dy * k)
      await sleep(dur / steps)
    }
    this.pos = { x, y }
  }
  async pointAt(target, { dx = 0, dy = 0 } = {}) {
    const b = await this.boxOf(target)
    await this.moveTo(b.x + b.width / 2 + dx, b.y + b.height / 2 + dy)
    return b
  }
  /** Move to element, click with ripple, log a click event (the event is stamped when the click happens). */
  async click(target, label, { settle = 350, noWait = false } = {}) {
    const b = await this.pointAt(target)
    await sleep(120 * (this.mv ?? 1))
    this.push('click', label, b)
    await this.page.mouse.down()
    await sleep(70)
    await this.page.mouse.up()
    await sleep(settle)
    return b
  }
  async hover(target, label) {
    const b = await this.pointAt(target)
    if (label) this.push('pause', label, b)
    return b
  }
  /** Click the field then type naturally. */
  async type(target, text, label, { delay = this.delay ?? 34, clear = false, fill = false } = {}) {
    const b = await this.boxOf(target)
    await this.moveTo(b.x + Math.min(b.width / 2, 120), b.y + b.height / 2)
    await sleep(100)
    await this.page.mouse.down()
    this.push('type', label, b)
    await sleep(60)
    await this.page.mouse.up()
    if (clear) {
      await this.page.keyboard.press('Meta+A')
      await this.page.keyboard.press('Backspace')
    }
    for (const ch of text) {
      await this.page.keyboard.type(ch)
      await sleep(delay + Math.random() * 40 - 15)
    }
    await sleep(150)
    return b
  }
  async select(target, optionText, label) {
    // native <select> or custom: click then choose by text
    const b = await this.click(target, label)
    await this.page
      .getByRole('option', { name: optionText })
      .first()
      .click()
      .catch(async () => {
        await this.loc(target).selectOption({ label: optionText })
      })
    return b
  }
  async pause(ms, label, target) {
    let box
    if (target) box = await this.boxOf(target)
    if (label) this.push('pause', label, box ?? { x: 0, y: 0, width: W, height: H })
    await sleep(ms)
  }
  /**
   * Navigate. With `ready` (selector / locator) the whole load is cut from the video and timeline, so no blank or
   * "loading" frame is ever shown: the clip jumps from the previous screen to the fully rendered next one.
   */
  async goto(url, label, { wait = 'networkidle', ready = null } = {}) {
    const go = async () => {
      await this.page.goto(url, { waitUntil: 'domcontentloaded' })
      await this.page.waitForLoadState(wait).catch(() => {})
      if (ready) await this.loc(ready).waitFor({ state: 'visible', timeout: 30000 })
      await sleep(500)
    }
    if (ready && this.t0) {
      await this.cut(go)
      if (label) this.push('navigate', label, { x: 0, y: 0, width: W, height: H })
    } else {
      if (label) this.push('navigate', label, { x: 0, y: 0, width: W, height: H })
      await go()
    }
  }
  async scroll(dy, label, steps = 12) {
    if (label) this.push('pause', label, { x: 0, y: 0, width: W, height: H })
    for (let i = 0; i < steps; i++) {
      await this.page.mouse.wheel(0, dy / steps)
      await sleep(40)
    }
    await sleep(300)
  }
  /** Show real Mailpit mail for `to` inside a minimal inbox frame page. */
  async inbox(to, { subjectIncludes, label = 'Boîte de réception', open = true, owner = to } = {}) {
    const html = await inboxHtml(to, { subjectIncludes, owner })
    await this.context.route('http://inbox.localhost/**', (r) =>
      r.fulfill({ contentType: 'text/html; charset=utf-8', body: html }),
    )
    await this.goto('http://inbox.localhost/', label, {
      ready: this.page.frameLocator('#mail').locator('body *').first(),
    })
    return html
  }
  /** Show a downloaded PDF (first page rendered with Ghostscript) in a minimal viewer page. */
  async pdfViewer(pdfFile, { title = path.basename(pdfFile), label = 'Visionneuse PDF' } = {}) {
    const png = path.join(this.tmp, 'pdf-page.png')
    execFileSync('gs', [
      '-q',
      '-dNOPAUSE',
      '-dBATCH',
      '-sDEVICE=png16m',
      '-r200',
      '-dFirstPage=1',
      '-dLastPage=1',
      `-sOutputFile=${png}`,
      pdfFile,
    ])
    const pages = execFileSync('gs', [
      '-q',
      '-dNODISPLAY',
      '-dNOSAFER',
      '-c',
      `(${pdfFile}) (r) file runpdfbegin pdfpagecount = quit`,
    ])
      .toString()
      .trim()
    const b64 = fs.readFileSync(png).toString('base64')
    const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${esc(title)}</title><style>*{box-sizing:border-box}body{margin:0;background:#525659;font-family:Inter,-apple-system,sans-serif;height:100vh;display:flex;flex-direction:column;overflow:hidden}.bar{height:48px;background:#323639;color:#f1f3f4;display:flex;align-items:center;padding:0 20px;gap:18px;font-size:14px}.bar b{font-weight:500}.bar span{opacity:.75}.pg{flex:1;overflow:hidden;display:flex;justify-content:center;padding:22px 0}.pg img{height:auto;max-height:none;width:900px;align-self:flex-start;box-shadow:0 4px 18px rgba(0,0,0,.5);background:#fff}</style></head><body><div class="bar"><b>${esc(title)}</b><span>1 / ${pages}</span><span style="margin-left:auto">100 %</span></div><div class="pg"><img src="data:image/png;base64,${b64}"></div></body></html>`
    await this.context.route('http://pdf.localhost/**', (r) =>
      r.fulfill({ contentType: 'text/html; charset=utf-8', body: html }),
    )
    await this.goto('http://pdf.localhost/', label)
  }
  /** Stop, trim to the sync flash, cut skipped stretches, write mp4 (+ webm for chapters) + json into the out dir. */
  async finish({ trimLead = 0.0 } = {}) {
    await sleep(900)
    let endReal = null
    if (this.synced) {
      await this.page
        .evaluate(() => {
          const d = document.createElement('div')
          d.style.cssText = 'position:fixed;inset:0;background:#ff00ff;z-index:2147483647'
          document.documentElement.appendChild(d)
        })
        .catch(() => {})
      endReal = this.now()
      await sleep(500)
    }
    const total = (Date.now() - this.t0) / 1000
    const video = this.page.video()
    await this.page.close()
    await this.context.close()
    const src = await video.path()
    await this.browser.close()
    const out = this.outDir
    const base = path.join(out, this.chapter)
    fs.mkdirSync(out, { recursive: true })
    const run = (args) =>
      execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...args], { stdio: 'inherit' })
    // Locate the sync flashes in the raw video (50 fps resample, magenta centre pixel).
    let lead = Math.max(0, (this.t0 - this.created) / 1000 + trimLead)
    let drift = 1
    let vend = null
    if (this.synced) {
      const buf = execFileSync(
        'ffmpeg',
        [
          '-loglevel',
          'error',
          '-i',
          src,
          '-vf',
          'fps=50,crop=2:2:720:450,scale=1:1',
          '-f',
          'rawvideo',
          '-pix_fmt',
          'rgb24',
          '-',
        ],
        { maxBuffer: 1 << 28 },
      )
      const mag = []
      for (let i = 0; i + 2 < buf.length; i += 3)
        mag.push(buf[i] > 200 && buf[i + 1] < 70 && buf[i + 2] > 200)
      const runs = []
      for (let i = 0; i < mag.length; i++)
        if (mag[i] && (i === 0 || !mag[i - 1])) {
          let j = i
          while (j < mag.length && mag[j]) j++
          runs.push([i / 50, j / 50])
        }
      if (runs.length === 1 && vend === null && runs[0][0] > 1)
        console.warn(
          `${this.chapter}: WARNING start flash not found in the video; timeline sync unreliable`,
        )
      if (runs.length) {
        lead = runs[0][1]
        if (runs.length > 1 && endReal) {
          vend = runs[runs.length - 1][0]
          drift = (vend - lead) / endReal
        }
      }
      console.log(
        `${this.chapter}: sync flash ${runs.map((r) => r.map((x) => x.toFixed(2)).join('-')).join(' | ')} -> lead ${lead.toFixed(2)}s, drift ${drift.toFixed(4)}`,
      )
      if (Math.abs(drift - 1) > 0.15) drift = 1
    }
    // Keep [lead, vend) minus the cut ranges (video time = lead + t * drift).
    const keepEnd = vend ?? 1e6
    let sel = `gte(t,${lead.toFixed(3)})*lt(t,${keepEnd.toFixed(3)})`
    for (const [ca, cb] of this.cuts)
      sel += `*not(between(t,${(lead + ca * drift).toFixed(3)},${(lead + cb * drift).toFixed(3)}))`
    const vf = `fps=30,select='${sel}',setpts=N/(30*TB)`
    if (this.webm)
      run([
        '-i',
        src,
        '-an',
        '-vf',
        vf,
        '-c:v',
        'libvpx-vp9',
        '-b:v',
        '0',
        '-crf',
        '32',
        '-row-mt',
        '1',
        `${base}.webm`,
      ])
    run([
      '-i',
      src,
      '-an',
      '-vf',
      vf,
      '-r',
      '30',
      '-c:v',
      'libx264',
      '-crf',
      '23',
      '-preset',
      'medium',
      '-pix_fmt',
      'yuv420p',
      '-movflags',
      '+faststart',
      `${base}.mp4`,
    ])
    const dur = +parseFloat(
      execFileSync('ffprobe', [
        '-v',
        'error',
        '-show_entries',
        'format=duration',
        '-of',
        'csv=p=0',
        `${base}.mp4`,
      ]).toString(),
    ).toFixed(2)
    // Timeline: real seconds since the flash -> output seconds (drift applied, cut stretches removed).
    const events = []
    for (const e of this.events) {
      if (this.cuts.some(([ca, cb]) => e.t >= ca && e.t < cb)) continue
      const removed = this.cuts
        .filter(([, cb]) => cb <= e.t)
        .reduce((n, [ca, cb]) => n + (cb - ca), 0)
      events.push({ ...e, t: +((e.t - removed) * drift).toFixed(2) })
    }
    fs.writeFileSync(
      `${base}.json`,
      JSON.stringify(
        {
          chapter: this.chapter,
          width: W,
          height: H,
          duration: dur,
          lead: +lead.toFixed(2),
          drift: +drift.toFixed(4),
          events,
        },
        null,
        2,
      ),
    )
    fs.mkdirSync(RAW, { recursive: true })
    fs.copyFileSync(src, path.join(RAW, `${this.chapter}.raw.webm`))
    fs.rmSync(this.tmp, { recursive: true, force: true })
    console.log(
      `${this.chapter}: ${dur}s, ${events.length} events (recorded ${total.toFixed(1)}s, trimmed ${lead.toFixed(2)}s)`,
    )
    return { duration: dur }
  }
}

// ---- Mailpit ----
export async function mailpit(pathname, init) {
  const r = await fetch(`${MAILPIT}${pathname}`, init)
  if (!r.ok) throw new Error(`Mailpit ${pathname} ${r.status}`)
  return r.json()
}
export async function mailFor(to, { subjectIncludes, timeout = 30000 } = {}) {
  const end = Date.now() + timeout
  while (Date.now() < end) {
    const list = await mailpit(`/api/v1/search?query=${encodeURIComponent(`to:${to}`)}&limit=50`)
    const hit = (list.messages ?? []).filter(
      (m) => !subjectIncludes || m.Subject.toLowerCase().includes(subjectIncludes.toLowerCase()),
    )
    if (hit.length) return hit
    await sleep(700)
  }
  throw new Error(`No mail for ${to} (${subjectIncludes ?? '*'})`)
}
export async function clearMailFor(to) {
  await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${to}`)}`, {
    method: 'DELETE',
  })
}
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
async function inboxHtml(to, { subjectIncludes, owner }) {
  const msgs = await mailFor(to, { subjectIncludes })
  const first = await mailpit(`/api/v1/message/${msgs[0].ID}`)
  const fmt = (d) => new Date(d).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  const rows = msgs
    .map(
      (m, i) =>
        `<div class="row ${i === 0 ? 'sel' : ''}"><div class="av">${esc((m.From.Name || m.From.Address)[0].toUpperCase())}</div><div class="rb"><div class="r1"><b>${esc(m.From.Name || m.From.Address)}</b><span>${fmt(m.Created)}</span></div><div class="r2">${esc(m.Subject)}</div><div class="r3">${esc((m.Snippet || '').slice(0, 70))}</div></div></div>`,
    )
    .join('')
  const body = (first.HTML || `<pre>${esc(first.Text)}</pre>`).replace(
    /<head>/i,
    '<head><base target="_top">',
  )
  const srcdoc = body.includes('<base') ? body : `<base target="_top">${body}`
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Messagerie</title><style>
  *{box-sizing:border-box}body{margin:0;font-family:Inter,-apple-system,"Segoe UI",sans-serif;background:#eef0f4;color:#1c2330;height:100vh;display:flex;flex-direction:column}
  .top{height:56px;background:#fff;border-bottom:1px solid #dde1e8;display:flex;align-items:center;padding:0 22px;gap:14px}
  .logo{width:30px;height:30px;border-radius:8px;background:#2f6fed;color:#fff;display:grid;place-items:center;font-weight:700}
  .search{flex:1;max-width:560px;height:36px;border-radius:18px;background:#f1f3f7;display:flex;align-items:center;padding:0 16px;color:#7b8494;font-size:14px}
  .me{margin-left:auto;display:flex;align-items:center;gap:10px;font-size:14px;color:#445}.me i{width:32px;height:32px;border-radius:50%;background:#8a6528;color:#fff;display:grid;place-items:center;font-style:normal;font-weight:600}
  .main{flex:1;display:flex;min-height:0}.side{width:190px;padding:16px 10px;font-size:14px}.side div{padding:9px 14px;border-radius:18px;margin-bottom:2px}.side .on{background:#d8e4fb;font-weight:600;color:#1c3f8c}
  .list{width:370px;background:#fff;border-right:1px solid #dde1e8;overflow:auto}.row{display:flex;gap:12px;padding:14px 16px;border-bottom:1px solid #eef0f4}.row.sel{background:#e9f0fd}
  .av{width:38px;height:38px;border-radius:50%;background:#8a6528;color:#fff;display:grid;place-items:center;font-weight:600;flex:none}.rb{min-width:0;flex:1}
  .r1{display:flex;justify-content:space-between;font-size:14px}.r1 span{color:#7b8494;font-size:12px}.r2{font-size:14px;font-weight:600;margin:3px 0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.r3{font-size:13px;color:#7b8494;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .view{flex:1;display:flex;flex-direction:column;min-width:0;padding:14px 18px 18px}.card{flex:1;background:#fff;border-radius:12px;box-shadow:0 1px 3px rgba(0,0,0,.08);display:flex;flex-direction:column;min-height:0;overflow:hidden}
  .hd{padding:18px 24px;border-bottom:1px solid #eef0f4}.hd h1{font-size:20px;margin:0 0 8px;font-weight:600}.hd p{margin:0;font-size:13px;color:#667}
  iframe{flex:1;border:0;width:100%;background:#fff}</style></head><body>
  <div class="top"><div class="logo">M</div><b style="font-size:18px">Messagerie</b><div class="search">Rechercher dans les e-mails</div><div class="me"><span>${esc(owner)}</span><i>${esc(owner[0].toUpperCase())}</i></div></div>
  <div class="main"><div class="side"><div class="on">Boîte de réception</div><div>Envoyés</div><div>Brouillons</div></div>
  <div class="list">${rows}</div>
  <div class="view"><div class="card"><div class="hd"><h1>${esc(first.Subject)}</h1><p>De : ${esc(first.From.Name || '')} &lt;${esc(first.From.Address)}&gt; &nbsp;·&nbsp; À : ${esc(to)}</p></div>
  <iframe id="mail" srcdoc="${esc(srcdoc)}"></iframe></div></div></div></body></html>`
}

// ---- Real API access (setup/seed only; never used to fake what a recording shows) ----
export class Api {
  constructor(host, base = 'http://127.0.0.1:3100') {
    this.host = host
    this.base = base
    this.cookies = {}
  }
  async req(method, p, body, opts = {}, attempt = 0) {
    const { raw = false, headers = {} } = opts
    const u = new URL(this.base + p)
    const payload = body === undefined ? undefined : JSON.stringify(body)
    const res = await new Promise((resolve, reject) => {
      const r = http.request(
        {
          host: u.hostname,
          port: u.port,
          path: u.pathname + u.search,
          method,
          headers: {
            host: this.host,
            'content-type': 'application/json',
            origin: `http://${this.host}`,
            cookie: Object.entries(this.cookies)
              .map(([k, v]) => `${k}=${v}`)
              .join('; '),
            ...(payload ? { 'content-length': Buffer.byteLength(payload) } : {}),
            ...headers,
          },
        },
        (resp) => {
          const chunks = []
          resp.on('data', (c) => chunks.push(c))
          resp.on('end', () =>
            resolve({
              status: resp.statusCode,
              ok: resp.statusCode < 400,
              headers: resp.headers,
              body: Buffer.concat(chunks),
            }),
          )
        },
      )
      r.on('error', reject)
      if (payload) r.write(payload)
      r.end()
    })
    for (const c of [].concat(res.headers['set-cookie'] ?? [])) {
      const [kv] = c.split(';')
      const i = kv.indexOf('=')
      this.cookies[kv.slice(0, i)] = kv.slice(i + 1)
    }
    if (res.status === 429 && attempt < 5) {
      await sleep(15000)
      return this.req(method, p, body, opts, attempt + 1)
    }
    if (raw) return res
    const text = res.body.toString('utf8')
    let json
    try {
      json = text ? JSON.parse(text) : null
    } catch {
      json = text
    }
    if (!res.ok) {
      const e = new Error(`${method} ${p} -> ${res.status} ${text.slice(0, 400)}`)
      e.status = res.status
      e.body = json
      throw e
    }
    return json
  }
  get(p) {
    return this.req('GET', p)
  }
  post(p, b) {
    return this.req('POST', p, b ?? {})
  }
  put(p, b) {
    return this.req('PUT', p, b)
  }
  patch(p, b) {
    return this.req('PATCH', p, b)
  }
  del(p, b) {
    return this.req('DELETE', p, b)
  }
}
