# Wave 38 — Platform & Onboarding

## Implementation Plan

**Version target:** v2.5.0 (minor).
**Feature flag:** `platform.onboarding` (default `true` — onboarding is additive for new installs; existing installs already have `onboarding.completed = true` so no-op for them).
**Dependencies:** Wave 20 (chat-primary is the onboarding landing surface).
**Reference:** `roadmap/roadmap.md:1782-1826`.

**Goal:** 8 independent platform features bundled into one wave:
1. First-run walkthrough (5 steps).
2. Empty-state prompts (chat, file tree, terminal).
3. Command palette description-indexed search.
4. Auto-update channel toggle (stable / beta).
5. In-app changelog drawer on version bump.
6. Crash-report opt-in with path/content redaction.
7. Multilingual UI (English + pilot language).
8. Linux CI pass.

---

## Phase breakdown

| Phase | Scope | Key files |
|-------|-------|-----------|
| A | **Config + i18n infra.** Add `platform.{onboarding, crashReports, updateChannel, language}` to config. Set up i18n runtime: `src/renderer/i18n/index.ts` + `src/renderer/i18n/en.ts` + `src/renderer/i18n/es.ts` (Spanish pilot). Export `t(key, ...args)` function + `useLocale()` hook. No translations done yet — Phase A ships the framework + placeholders for the strings that PHASES B–E will need. | Config schema, i18n module + 2 locales, `useLocale` hook, tests |
| B | **First-run walkthrough.** `FirstRunTour.tsx` — 5-step modal series anchored to chat/file-tree/terminal/settings/profile. Uses `onboarding.completed` config flag to gate first-launch. Skippable. On completion, sets `onboarding.completed = true`. | `src/renderer/components/Onboarding/FirstRunTour.tsx` + step sub-components + tests |
| C | **Empty-state prompts.** Contextual empty-state renders when a panel has no content: Chat empty → "Start a conversation or try a sample prompt"; FileTree empty → "Open a project"; Terminal empty → "Run a command". Each has a Dismiss (session) or Don't-show-again (persistent). | Empty-state components under `src/renderer/components/EmptyState/` + consumers + tests |
| D | **Command palette description search.** Extend existing command palette to index by description + tags, not just name. Search ranks name matches highest, description matches next, tag matches lowest. | `src/renderer/components/CommandPalette/CommandPalette.tsx` + fuzzy matcher utility + tests |
| E | **Changelog drawer on version bump.** Read current app version. Compare to `config.platform.lastSeenVersion`. On mismatch, open a drawer showing the changelog since that version. Changelog source: static `docs/CHANGELOG.md` parsed into a version-keyed map at build time OR runtime fetch from GitHub releases (pick simpler — prefer build-time parse). Skippable; "dismiss all" button. | `src/renderer/components/Changelog/ChangelogDrawer.tsx` + parsed changelog data + tests |
| F | **Auto-update channel + crash reporter.** Extend `autoUpdater` to support `updateChannel: 'stable' \| 'beta'`; Settings toggle. Downgrade blocked (warn + reject). Crash reporter: wraps `process.on('uncaughtException')` / `unhandledRejection`, captures `error.stack` + app version + OS + CLI version; redacts absolute paths (`/Users/<name>/...` → `~/...`) and chat content (never include); writes to `~/.ouroboros/crash-reports/` locally + opt-in upload to the Ouroboros repo issues (opt-in only, default off). | `src/main/autoUpdater.ts` (extend), `src/main/crashReporter.ts` (extend), Settings sections, tests |
| G | **Pilot-language rollout.** Actually translate the ~60 strings the onboarding tour + empty states + Settings use into Spanish (`es.ts`). Switching `platform.language` in Settings re-renders with the new locale. Fall back to English for any missing key with a console.warn. | Update `es.ts` with translations, language picker in Settings, tests |
| H | **Linux CI pass.** Extend `.github/workflows/ci.yml` to add an Ubuntu job alongside the existing Windows/macOS matrix. Fix anything Linux-specific that breaks. Document Fedora manual-test plan in `docs/platform-linux.md`. | `.github/workflows/ci.yml`, `docs/platform-linux.md` |
| I | **Docs + capstone.** `docs/platform.md` covers all features + i18n contribution guide. Full verification. | `docs/platform.md`, capstone |

---

## Architecture notes

**i18n design (Phase A):**
- Simple lookup-based: `t('onboarding.step1.title')` returns the translation.
- No heavyweight framework (no `react-i18next`, no `i18next`). Plain object lookup + optional `{0}`/`{1}` positional interpolation.
- `useLocale()` returns `{ language, setLanguage, t }` — language stored in `config.platform.language`, defaults to `navigator.language` first two chars if one of the supported locales, else English.
- Strings keyed by nested path: `onboarding.step1.title`, `emptyState.chat.primary`, etc.
- Locale file is just a typed object — no compile-time codegen.

**First-run tour (Phase B):**
- 5 steps:
  1. "Welcome to Ouroboros" — chat-primary view explanation.
  2. "Your sessions" — session sidebar pointer.
  3. "Context awareness" — quick note on how project root is picked.
  4. "Commands" — command palette shortcut (Cmd+Shift+P).
  5. "Settings" — Settings reachable from status bar.
- Each step is a small overlay with arrow/tooltip pointing at a real UI element. Use existing glass overlay primitives.
- Triggered on first launch when `onboarding.completed !== true` AND the chat-primary layout is active.

**Changelog parsing (Phase E):**
- `docs/CHANGELOG.md` is maintained by humans in Keep-a-Changelog format.
- At build time, Vite plugin (or a simple pre-build script) parses the file into a TS module: `src/renderer/generated/changelog.ts` exports `CHANGELOG: Record<string, ChangelogEntry>`.
- Runtime reads the generated module. Build-step script is `tools/build-changelog.js`, hooked into `npm run build:web`.
- Alternative: parse at renderer mount if the generated module doesn't exist (development fallback). Prefer build-time.

**Crash reporter (Phase F):**
- `uncaughtException` + `unhandledRejection` handlers at main process entry.
- Capture: `error.stack`, `error.message`, app version, OS + version, Node version, CLI version if detectable.
- Redaction:
  - Home dir: replace `os.homedir()` with `~`.
  - Windows drive letters: `C:\\Users\\<name>\\...` → `~\\...`.
  - Anything that looks like a path with >3 segments containing common project names — best-effort; not exhaustive (we can never fully redact file paths, document this).
  - Never include config values, never include session transcripts.
- Storage: JSON file per crash at `~/.ouroboros/crash-reports/<timestamp>.json`.
- Opt-in upload: off by default. If on, POST to a webhook the user configures (`config.platform.crashReportWebhookUrl`) — no default Anthropic endpoint since we're Max-subscription.
- Settings UI: toggle + "view recent crash reports" button → opens the folder or lists them inline.

**Auto-update channel (Phase F):**
- Existing `autoUpdater.ts` uses electron-builder's provider with GitHub releases (verify — grep).
- Add `updateChannel` config (`'stable' | 'beta'`). Stable tracks GitHub releases marked production; beta tracks pre-releases.
- Downgrade block: if server offers a version < current, log warn and skip.

**Linux CI (Phase H):**
- Existing CI likely runs on `ubuntu-latest` for unit tests but not for the Electron build. Add an Electron build job.
- Node-pty native compile on Ubuntu needs `build-essential` + `python3` preinstalled (usually is on ubuntu-latest runners).
- `better-sqlite3` native also needs prebuilt for Linux — check `npm rebuild` step.

---

## Risks

- **i18n string explosion.** Wave 38 intentionally scopes strings to onboarding + Settings + empty-states. Full UI translation is explicit non-scope. Mitigate string sprawl by being strict about what gets keyed.
- **Crash reporter PII leakage.** Path redaction is best-effort. Document this in `docs/platform.md` — users who care about strict redaction should keep upload disabled.
- **Changelog parse brittleness.** Keep-a-Changelog format has rules; non-conforming entries fail to parse. Add a build-step warning instead of hard-failing.
- **Tour overlay positioning on resize.** Step overlays anchor to DOM elements; if the element moves mid-step (resize, panel collapse), overlay may detach. Listen for `ResizeObserver` on the anchor and reposition.
- **Beta channel downgrade loop.** If beta has version `2.6.0-beta.1` and user switches to stable with latest `2.5.5`, reject the downgrade. Test this path.
- **Linux native builds.** node-pty + better-sqlite3 + xterm addons — may surface platform-specific issues. Accept a 1-day shakeout after the CI turns green.

---

## Acceptance

- Fresh install (no existing config) → walkthrough renders at first launch.
- Command palette: search "docs" finds `marketplace:open` via its description, not just its name.
- Settings → Auto-update channel → switch to beta → next update check offers a pre-release.
- Version bump: on next launch, changelog drawer opens showing entries since last seen version.
- Opt-in crash reporter → synthetic crash → report file created, paths redacted.
- Settings → Language → Spanish → onboarding + Settings re-render in Spanish.
- Ubuntu GitHub Actions job passes all three tsc/lint/vitest phases.

---

## Per-phase commit format

`feat: Wave 38 Phase X — short summary`

Co-author trailer:
```
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
```

Parent pushes once after Phase I.
