# UI language and French default

The website defaults to French, independently of the browser language. English
remains available through the shared FR/EN control on public authentication pages
and the authenticated navigation bar. The choice is stored as `slama.ui.language`;
switching language does not remount routes or discard unsaved form values.

## Shared implementation

- `ui/src/lib/i18n.ts` initializes i18next, selects the default and synchronizes the
  document language. `setUiLanguage` changes/persists the choice.
- `ui/src/lib/locales/fr.ts` is the French phrase catalog. `translate` looks up
  English source phrases; `registerTranslations` registers existing feature
  namespaces in both languages without changing their stable keys.
- React components using the shared translator subscribe with `useUiLanguage`;
  namespace-based components use `useTranslation`. Avoid module-initialized
  translated strings that cannot respond to a language change.
- Use interpolation for variable values, never concatenate translated sentence
  fragments. Translate static labels, hints, placeholders and accessible names.
- Shared validation/API error presentation localizes user-facing errors while
  retaining machine error codes and request IDs. Generated schemas stay generated.
- The official calendar uses French/English date-fns locales. `uiLocale()` supplies
  French-Morocco/English number and date formatting for interface values.

Customer/product names, free text, identifiers, currency codes, stored document
language, exports and frozen PDF snapshots are not automatically translated.
Changing the interface language must never rewrite a business record.

## Checks and future components

Run `pnpm --dir ui i18n:check` (also included in UI lint). It checks French catalog
coverage for literal translator calls and registered namespaces, and matching
interpolation placeholders. Dynamic labels still require review and browser QA.
Add French entries with each new UI feature, use shared translated components and
check both languages, light/dark themes and mobile widths.

Tests cover the default, persisted preference, HTML language, form-state retention,
namespace interpolation and translated errors. Existing behavioral tests explicitly
select English; dedicated localization tests select French.
