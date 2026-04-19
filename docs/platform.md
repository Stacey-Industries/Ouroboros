# Platform & Onboarding — v2.5.0 Feature Guide

Wave 38 bundles eight platform features into Ouroboros v2.5.0: a first-run walkthrough,
empty-state prompts, richer command palette search, an in-app changelog drawer, an
auto-update channel toggle, opt-in crash reports, a multilingual UI pilot (English +
Spanish), and Linux CI coverage.

---

## Feature flag

All Wave 38 onboarding features are gated behind the `platform.onboarding` config key,
which defaults to `true`. Existing installs with `platform.onboarding.completed = true`
skip the walkthrough automatically — the flag is additive for new installs only.

---

## First-run walkthrough (Phase B)

A 5-step modal overlay introduces new users to the IDE. It fires once on first launch
when `platform.onboarding.completed` is not set and the chat-primary layout is active.

### Steps

| # | Title | What it points at |
|---|-------|-------------------|
| 1 | Welcome to Ouroboros | Chat panel — IDE purpose |
| 2 | Your Sessions | Session sidebar — tab management |
| 3 | Context Awareness | Project picker — folder selection |
| 4 | Command Palette | Status bar shortcut (Cmd/Ctrl+Shift+P) |
| 5 | Settings | Settings trigger in status bar |

Each step anchors to the live DOM element via `data-tour-anchor` attributes. A
`ResizeObserver` repositions the overlay if the anchor moves during a step. When an
anchor element is absent the overlay centers on screen as a fallback.

### Skip / replay

- **Skip anytime:** click "Skip tour" or press Escape. Both set
  `platform.onboarding.completed = true` immediately.
- **Replay:** open Settings → Platform → clear (reset) `platform.onboarding.completed`,
  or run `config:reset` from the command palette and reload.

---

## Empty-state prompts (Phase C)

Contextual prompts render in the three main panels when they have no content:

| Panel | Primary message | Actions |
|-------|-----------------|---------|
| Chat | "Start a conversation or try a sample prompt" | Got it (dismiss) |
| File tree | "Open a project folder to browse files" | Open folder / Dismiss |
| Terminal | "Press + to open a terminal or start a Claude session" | New terminal / Dismiss |

### Dismiss behaviour

Each panel supports two dismiss modes:

- **Session dismiss** — hides the prompt until the next app launch. Stored in memory only.
- **Persistent dismiss** — hides the prompt indefinitely. Panel ID stored as a key in
  `platform.dismissedEmptyStates` (a `Record<string, boolean>` map in config). Cleared
  by resetting that key or running `config:reset`.

---

## Command palette search (Phase D)

The command palette now indexes three fields per command, ranked in order:

| Field | Weight | Badge shown |
|-------|--------|-------------|
| `label` (command name) | highest (1.0×) | — |
| `description` | medium (0.5×) | "desc" |
| `tags` | lowest (0.25×) | "tag" |

When a description or tag field produces the winning score, a small origin badge appears
beside the result so users know why it matched.

Scoring tiers: exact prefix → contains → fuzzy subsequence. Results are stable-sorted
by score descending; ties preserve registration order.

### Contributing commands

When registering a command, supply `description` and `tags` to improve discoverability:

```ts
registerCommand({
  id: 'marketplace:open',
  label: 'Open Marketplace',
  description: 'Browse and install extensions and themes',
  tags: ['extensions', 'plugins', 'store'],
  action: () => { /* … */ },
});
```

Commands without a `description` or `tags` are still matched on `label` as before.

---

## Changelog drawer (Phase E)

On each version bump the changelog drawer opens automatically to show what changed since
the user's last-seen version.

### How it works

1. `docs/CHANGELOG.md` is maintained in [Keep a Changelog](https://keepachangelog.com/)
   format.
2. At build time, `tools/build-changelog.js` parses `docs/CHANGELOG.md` into a version-
   keyed map and writes `src/renderer/generated/changelog.ts`. This generated module is
   listed in `.gitignore` and must not be committed.
3. At runtime, the `ChangelogDrawer` component reads `config.platform.lastSeenVersion`.
   If it differs from the current app version the drawer opens automatically.
4. Clicking "Dismiss all" writes the current version into `lastSeenVersion` and closes
   the drawer.

### Contributing changelog entries

Edit `docs/CHANGELOG.md` under the `[Unreleased]` heading. On release, rename the block
to `[x.y.z] - YYYY-MM-DD` and run:

```sh
npm run build:changelog
```

This regenerates `src/renderer/generated/changelog.ts`. The `build:web` and
`postinstall` hooks run `build:changelog` automatically — you only need to run it
manually during development.

Non-conforming entries (e.g., missing section headers) produce a build-step warning
rather than a hard error. The drawer shows whatever was successfully parsed.

---

## Auto-update channel (Phase F)

Switch between the **Stable** (default) and **Beta** update tracks in
Settings → Platform → Update channel.

| Channel | Tracks |
|---------|--------|
| Stable | GitHub releases marked as production |
| Beta | GitHub pre-releases (suffixed `-beta.N`) |

**Downgrade protection:** if the update server offers a version that is lower than the
currently installed version the update is silently rejected and a warning is logged. This
prevents accidental downgrade when switching from Beta back to Stable while the latest
stable is behind the most recent beta.

Setting `updateChannel` writes to `config.platform.updateChannel` and takes effect on
the next update check — no restart required.

---

## Crash reports (Phase F)

Crash reporting is **opt-in and off by default.**

When enabled, unhandled exceptions (`uncaughtException` + `unhandledRejection`) in the
main process are captured into a structured JSON record and written to:

```
~/.ouroboros/crash-reports/crash-<timestamp>.log
```

where `<timestamp>` is the ISO 8601 UTC timestamp with `:` and `.` replaced by `-`
(e.g. `2026-04-18T12-30-00-000Z.json`). The actual extension is `.json`; the `crash-`
prefix and sanitised timestamp form the filename via `crashReporterStorage.ts`.

Implementation: `path.join(os.homedir(), '.ouroboros', 'crash-reports')` — not
`app.getPath('userData')`.

### Record fields

| Field | Content |
|-------|---------|
| `timestamp` | ISO 8601 UTC |
| `version` | App version from `package.json` |
| `os` / `osVersion` | Platform string + OS release |
| `nodeVersion` | Node.js version used by Electron |
| `message` | Error message (paths redacted) |
| `stack` | Stack trace (paths redacted) |

### Path redaction

The reporter makes a best-effort attempt to remove absolute paths before writing:

- `os.homedir()` literal is replaced with `~`.
- Windows `C:\Users\<name>\` paths are replaced with `~\`.
- Unix `/Users/<name>/` paths are replaced with `~/`.

**Documented limitation:** path redaction is not exhaustive. Paths embedded in error
messages, module names, or stringified objects that do not match the above patterns will
not be redacted. Users who require strict redaction should leave the upload option
disabled and inspect reports locally before sharing.

Chat content and config values are **never** included in crash records.

### Optional webhook upload

Set `platform.crashReports.webhookUrl` in config (Settings → Platform → Crash report
webhook URL) to POST crash records to a URL of your choice. The POST body is the JSON
record; `Content-Type: application/json`. Upload is best-effort — network failures are
logged as warnings and do not affect app operation.

There is no default Anthropic endpoint. Upload is disabled unless an explicit webhook URL
is configured.

By default only `https:` webhook URLs are accepted. Set `platform.crashReports.allowInsecure = true`
to permit `http:` URLs (debug scenarios only — not for production use).

### Enabling

Settings → Platform → "Send anonymous crash reports to help improve Ouroboros".

---

## Languages (Phase G)

Ouroboros ships a multilingual UI pilot. The v2.5.0 pilot supports:

| Code | Language |
|------|----------|
| `en` | English (primary) |
| `es` | Spanish |

Switch languages in Settings → Platform → Language. The setting writes to
`config.platform.language` and re-renders all translated strings immediately without a
restart.

Language detection on first launch: if `navigator.language` matches a supported locale
code (first two characters), that locale is used as the default. Otherwise English.

Strings missing from a locale fall back silently to English. A `console.warn` is emitted
in development for each missing key — useful when authoring new locale files.

---

## Linux support (Phase H)

CI now runs on Ubuntu alongside Windows and macOS. See
**[`docs/platform-linux.md`](platform-linux.md)** for:

- Prerequisites (Ubuntu 22.04+ / Fedora 39+)
- Install, build, and dev-server instructions
- Smoke checklist for manual Linux testing
- Fedora-specific manual test notes
- Known Linux-specific issues (Wayland, HiDPI, clipboard, AppImage sandbox, SELinux,
  node-pty compile failures)

The CI matrix (`ubuntu-latest`) runs typecheck, lint, vitest, and `npm run build`.
Ubuntu additionally runs a `build:web` smoke test. Native dependencies (`node-pty`,
`better-sqlite3`) are rebuilt against Electron's ABI in every CI run via `npm rebuild`.

---

## i18n contribution guide

### Adding new strings

1. Add the key to `src/renderer/i18n/en.ts` first. English is the source of truth — no
   key may appear in another locale file without existing in `en.ts`.

2. Mirror the key in every other locale file (`es.ts`, etc.). Use the same nested
   structure. Missing keys fall back to English at runtime.

3. Keys are dot-namespaced and grouped by feature area:

   ```
   onboarding.*       — first-run walkthrough copy
   emptyState.*       — empty-state panel prompts
   settings.*         — Settings UI labels
   changelog.*        — changelog drawer
   tour.*             — tour navigation buttons
   common.*           — shared verbs (Close, Cancel, Save, …)
   ```

   Add new feature groups rather than placing keys into an existing group where the
   semantics don't fit.

4. Use `{0}`, `{1}`, … positional placeholders for interpolated values:

   ```ts
   // en.ts
   sessionCount: 'You have {0} active sessions',

   // Usage
   t('sessionCount', String(sessions.length))
   ```

5. Brand names (`Ouroboros`, `Claude`, `Codex`) are not translated — preserve them
   verbatim in all locale files.

### Adding a new locale

1. Create `src/renderer/i18n/<code>.ts` (e.g., `fr.ts` for French). Export a constant
   named `<CODE>_STRINGS` with the same nested structure as `EN_STRINGS`.

2. Register the locale in `src/renderer/i18n/index.ts`:
   - Import the new strings object.
   - Add the locale code to the `SUPPORTED_LOCALES` array.
   - Add an entry to the locale map passed to `setLocale`.

3. Add a `<select>` option in `src/renderer/components/Settings/PlatformLanguageSection.tsx`
   with the locale code and display name.

4. Add tests in `src/<code>.test.ts` asserting that keys do not all match English
   (prevents shipping placeholder translations).

### Scope note

Wave 38 deliberately limits translated strings to onboarding, empty states, Settings, and
the changelog drawer — roughly 60 keys. Full UI translation (file tree labels, terminal
strings, editor commands, etc.) is explicitly out of scope for v2.5.0 and deferred.
