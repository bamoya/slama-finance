# Owner authentication — layout studies

Status: **C — Continuum selected and integrated** for owner login, registration, recovery and verification. Authentication contracts and backend behavior are unchanged.

These studies keep the approved BaMoYa Finance public header, footer, typography, themes and shared UI controls. They connect the marketing website visually to the Classic owner portal. French is the default; English and dark mode use the existing application preferences.

## Compare the proposals

Start the isolated prototype:

```sh
pnpm --dir ui/.local/bamoya-auth-designs dev
```

Open <http://localhost:5177/>. Each proposal has its own page and supports both login and registration:

| Variant         | Preview                             | Composition                                                                          | Tradeoff                                                        |
| --------------- | ----------------------------------- | ------------------------------------------------------------------------------------ | --------------------------------------------------------------- |
| A — Essentiel   | <http://localhost:5177/essential>   | Centered account card in the public shell. Recommended.                              | Clearest access flow; little product context.                   |
| B — Perspective | <http://localhost:5177/perspective> | Static product preview beside the account form.                                      | More reassurance; longer on mobile, where the form comes first. |
| C — Continuum   | <http://localhost:5177/continuum>   | One panel containing the form and an organization context area.                      | Closest to the portal composition; more secondary content.      |
| D — Guidé       | <http://localhost:5177/guided>      | Two registration steps: email, then password and confirmation. Login stays one step. | Less information per step, with an additional interaction.      |

The integrated pages are available at `/auth/login` and `/auth/register`; all owner recovery and verification pages use the same layout. The production context panel explains real capabilities instead of showing the fictional organization from the study.

Append `?mode=signup` to open registration directly. Use the form tabs to switch modes. No account is created, no login is performed, and no email is sent. Example organization information is fictional. Product screenshots are static design references.

The prototype imports the existing marketing shell and global Button, Input and Checkbox components. Its styles and simulation state remain isolated in `ui/.local/bamoya-auth-designs`; it introduces no production routes or API contracts. This ignored directory is a local design artifact, not a committed application feature.

## Dimensional reference

Open [the self-contained drawing](owner-auth-layout-studies.html), or <http://localhost:5177/drawing.html>. It covers all four desktop compositions, mobile stacking, shared field construction, spacing, radii and layers. Values come from the authored prototype and browser measurements; they describe the design studies; C is the selected composition. Content height is flexible and depends on form mode, language and errors.

Reference measurements at a 1440px desktop viewport: header 77px, centered form 420px, card padding 28px, border 1px, inner width 362px, controls 44px high, field gap 7px, form gap 18px, card radius 14px and control radius 8px. At a 390px mobile viewport the header is 68px and the centered card is 350px wide.

## Implementation boundary

Continuum is implemented within `identity/owners`, using the existing generated contracts and shared AuthForm. The application router composes it with the public shell exported by the marketing feature, avoiding direct dependencies between features. Staff authentication keeps its existing layout. Any consent or trial messaging must match the final functional behavior; the prototype does not change either policy.

SaaS feature development takes priority over legacy Slama client integration. A fresh local database can be used when necessary for feature work; this design study does not create, reset or migrate any database.
