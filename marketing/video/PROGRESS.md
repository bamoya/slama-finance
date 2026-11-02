# Marketing film: progress and next steps

Paused on 2026-11-02. This file records where the marketing video work stopped and what remains, so it can
resume without re-deriving the context. See `README.md` for how the pipeline works.

## What is on the site today

- `ui/public/marketing/videos/` holds the film rendered on 2026-11-01 (commit `341b794`): 2:21, with the
  approved "Avion" animations, the 2.5 s intro and the camera fix. The four cut-downs (Facturation, Relances,
  Rapports, Modèles) are there too, in 16:9 and square, with JPG posters.
- The home page and feature pages show them as read-only looping videos with click-to-enlarge
  (`ui/src/features/platform/marketing/components/demo-video.tsx`, commit `4ee6e98`).

## Approved storyboard (target: about 2:35–2:45, never above 3:00)

| Order | Scene                                                                                                               | Source            |
| ----- | ------------------------------------------------------------------------------------------------------------------- | ----------------- |
| 1     | Intro, 2.5 s ("La finance de votre entreprise, enfin claire.")                                                      | Remotion          |
| 2     | Owner overview, period = last 3 months                                                                              | clip1             |
| 3     | Question card « Vous gérez plus d'une société ? »                                                                   | Remotion          |
| 4     | New organization (name + address only)                                                                              | clip2             |
| 5     | Organization dashboard                                                                                              | clip3             |
| 6     | Invoice form, then the "Avion" invoice-sent animation, then the real email                                          | clip4 + animation |
| 7     | "Avion" reminder animation (problem → reminder → payment back to the owner), then the real reminder email           | animation + clip6 |
| 8     | Real scheduled report email, then the attached PDF opened (no animation)                                            | clip7, to rebuild |
| 9     | Question card « Votre comptable a besoin d'accès ? », owner invites Salma                                           | clip8             |
| 10    | Staff access for real: Karim's full menu next to Salma's reduced menu, then the "Accès réservé" page (no animation) | clip8b            |
| 11    | Question card « Des factures qui vous ressemblent ? », template animation, then the real template editor            | animation + clip9 |
| 12    | Outro « Essai gratuit de 7 jours · bfinance.ma »                                                                    | Remotion          |

Animation designs: `design/animations-reference.html`, tab "A · Avion" only (approved). The reports and staff
animations are kept as components in `src/film/animations/` for reference but are out of the storyboard.

## Done but not rendered yet (this commit)

- Demo data is generated relative to the recording date (3 months ending today); the period used by clips is
  the `DEMO_PERIOD = 'last-3-months'` setting. Clip 1 was checked: 1 291 338,00 MAD invoiced and a full
  3-month chart.
- Clips 1, 2, 3, 4, 6, 7, 8 and 9 re-recorded with the relative dates (2026-11-01, 18:11–18:27).
- First take of the staff side-by-side scene (`clip8b-menu-admin`, `clip8b-acces-limite`) and the
  `src/film/Compare.tsx` layout. That take shows the old "404 · Page introuvable"; it must be re-recorded now
  that commit `9add668` shows the "Accès réservé" page.
- Storyboard edits in progress in `src/film/storyboard.ts` (staff and reports animations removed).
- The old tutorial chapters in `public/recordings/` were re-recorded as a side effect of re-seeding; they are
  not used by the film.

## Remaining work

1. Re-record `clip8b-acces-limite`: Salma logs in on the org host, shows her reduced menu, opens the settings
   URL and gets the real "Accès réservé" page.
2. Rebuild clip7 as the real scheduled report: send the real monthly report (not tagged `[TEST]`), show it in
   the inbox frame, open the attached PDF and scroll briefly through the figures. Update `Film-Rapports`.
3. Check that clip3 (dashboard) and clip7 (reports) use `DEMO_PERIOD`.
4. `Film-Facturation` cut-down: start at the end of the invoice form (the "Émettre" click), then the
   animation and the real email; 15–20 s.
5. Square film: keep the intro tagline on one line.
6. Render (`pnpm --filter @b-finance/marketing-video demo:render`), check the overview and staff scenes, copy
   the outputs to `ui/public/marketing/videos/` with the same filenames (faststart, JPG posters 1280x720 and
   720x720), run `pnpm -s format:check`, commit.

Keep checks light: one take per clip and one frame check per changed scene. The full re-record takes about
30–45 minutes of machine time.

## How to resume

```
cd marketing/video
./scripts/demo-env.sh start        # demo API :3100, demo UI :5174, database bfinance_demo
node scripts/record/film.mjs --only clip8b-acces-limite
node scripts/record/film.mjs --only clip7-rapport
pnpm demo:render
./scripts/demo-env.sh stop
```

The user's own dev servers (:3000, :5173) and dev database are never touched by this pipeline.
