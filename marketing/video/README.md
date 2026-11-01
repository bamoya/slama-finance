# B-Finance marketing video

## Composition

Remotion project (French, 30 fps, 1920x1080 and `-Square` 1080x1080) that frames real-app recordings in a
branded browser window with captions, smooth zoom/pan on timeline events, click rings and a chapter progress bar.

- Compositions: `Chapter-01-Compte` ... `Chapter-09-Rapports`, `Visite-complete` (intro + 9 chapters + outro,
  crossfades), `Intro`, `Outro`; each with a `-Square` twin.
- Chapter titles, subtitles and hosts: `src/config.ts`. Brand tokens: `src/theme.ts` (from `marketing.css`).
- Recordings are picked up by convention: `public/recordings/chNN-<name>.mp4` plus `chNN-<name>.json`
  (`{duration, events:[{t,type,label,box}]}`, 1440x900 video pixels). Missing chapters fall back to
  `public/placeholder/`. Re-run `pnpm manifest` (done automatically by the scripts below) after adding files.
- Commands (from `marketing/video`, or `pnpm --filter @b-finance/marketing-video <script>`):
  `pnpm studio`, `pnpm typecheck`, `pnpm render:all [--only=Chapter-05-Devis] [--no-square] [--square] [--webm] [--crf=22]`.
  Outputs go to `out/` (gitignored): mp4 (H.264), a poster PNG and optional webm per composition.

## Recording

Real-app screen recordings (Playwright, 1440x900, French, light theme, visible cursor) of an isolated demo
environment. The user's dev servers (:3000/:5173) and dev database are never used.

```bash
cd marketing/video/scripts
./demo-env.sh fresh        # drop/recreate DB bfinance_demo, start API :3100 + Vite :5174, wait until ready
./demo-env.sh stop         # stop both (also: start | reset | snapshot NAME | restore NAME | wait | env)
cd record
node run-all.mjs                 # fresh DB -> ch01..ch09 (snapshots between chapters), ~15 min
node run-all.mjs --only ch05     # re-record one chapter from the previous chapter's snapshot
node run-all.mjs --from ch05     # re-record ch05..ch09
```

- Demo env: DB `bfinance_demo` on the dev Postgres container (own database, `slama` owner / `slama_app` runtime role),
  API `:3100` (`PLATFORM_DOMAIN=localhost:5174`, Mailpit SMTP, `EMAIL_FROM=factures@atlas-negoce.ma`,
  `REPORT_POLL_MS=3000`), Vite `:5174` (`VITE_API_PROXY_TARGET`, `VITE_PLATFORM_DOMAIN`). Sites:
  `app.localhost:5174`, `atlas-negoce.localhost:5174`. Needs Docker postgres/mailpit running, ffmpeg and Ghostscript.
- Story: Karim Benali signs up (ch01) and creates "Atlas Négoce SARL" (ch02, trial). `seed-all.mjs` then seeds, through the
  real API, Business subscription (paid), company settings/RIB, 5 categories, 12 products (20 % TVA), 10 clients,
  32 invoices Aug-Oct 2026 with payments, 8 estimates, a second org "Atlas Négoce Export" (atlas-export), a "Commercial"
  role and staff member Nadia Chraibi. ch03-ch09 are then recorded in order.
- Each chapter script (`scripts/record/chNN-*.mjs`) writes `public/recordings/chNN-*.mp4|webm|json`. The json is
  `{chapter,width,height,duration,lead,events:[{t,type:click|type|pause|navigate,label,box:{x,y,width,height}}]}`;
  `t` is seconds in the trimmed video, `box` in video pixels (1440x900). E-mail and PDF screens use a minimal inbox /
  PDF-viewer page (`lib.mjs`) that renders the real Mailpit HTML and the real downloaded PDF.
- Silent API steps (never shown): default template + e-mail rules (`between.mjs`), due reminder timing set right
  after the payment in ch07 (demo date is fixed), monthly report schedule before ch09.
- `raw/` and `*.webm` are git-ignored; mp4 + json are committed (about 8 MB). `.demo-run/` holds logs and pids.
