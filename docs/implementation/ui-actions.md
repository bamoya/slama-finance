# UI action conventions

- Use the shared `Button` for buttons and `buttonVariants()` for navigation links styled as actions. Do not duplicate primary colors in feature pages.
- Default is the primary Slama gold action: filled accent gold in light mode; transparent with a darker gold border, readable gold label and subtle gold hover background in dark mode. This includes login, password recovery, password replacement, create, edit and save actions.
- Use `outline` for secondary actions such as cancel, reload and credential reissue.
- Use `destructive` for deletion and archiving. Pass this variant to `ConfirmAction` so both the trigger and confirmation communicate the risk. Staff disabling uses a neutral `outline` trigger in both themes, with its existing confirmation warning preserved.
- Every edit action uses a pencil icon paired with its label (or an accessible label for icon-only links).
- In dark mode, all shared action variants are outlined, including destructive actions (red border and label). Navigation links use outlined hover/active states. Legacy POC buttons follow this treatment too; switches and color swatches retain filled states to communicate their values. Light-mode styles are unchanged.
- Keep matrix actions in one wrapping row: destructive actions on the left, reload and primary save on the right.
- Pair action icons with visible labels. Hide decorative icons from assistive technology; icon-only controls must have an accessible label.
- Define colors centrally in `ui/src/styles/index.css`; use shared variants for future pages as well.
