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
