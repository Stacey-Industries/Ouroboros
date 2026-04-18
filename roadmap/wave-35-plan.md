# Wave 35 — Theme Import & Customization

## Implementation Plan

**Version target:** v2.3.1 (patch).
**Feature flag:** `theming.vsCodeImport` (default `true` — per roadmap.md:1671, but gate individual sub-features behind sub-flags if any prove risky).
**Dependencies:** Wave 17 (preset engine), existing theme runtime (`useTheme*`).
**Reference:** `roadmap/roadmap.md:1667-1701`.

**Scope:** four independent themeing enhancements bundled into one wave:
1. VS Code theme JSON import → token set.
2. Accent-color picker decoupled from full theme swap.
3. Thinking-verb / spinner customization.
4. Per-pane font-family (editor / chat / terminal).

**Prior art on disk:**
- `src/renderer/themes/` — retro, modern, warp, cursor, kiro theme definitions.
- `src/renderer/styles/tokens.css` — design token source.
- `src/renderer/hooks/useTheme.ts` + `useTheme.tokens.ts` — theme runtime.
- `src/renderer/components/Settings/` — existing panes.

---

## Phase breakdown

| Phase | Scope | Key files |
|-------|-------|-----------|
| A | **Config schema + token-override mechanism.** Add `theming.{accentOverride, verbOverride, fonts: {editor, chat, terminal}, customTokens}` to config. Add a `useTokenOverrides()` hook that applies overrides as CSS custom properties on `document.documentElement` AFTER theme bootstrap. Overrides persist across reloads. | `configSchemaTail.ts`, `config.ts`, `electron-foundation.d.ts`, `useTokenOverrides.ts` + test, bootstrap in `App.tsx` |
| B | **VS Code theme parser.** `src/renderer/themes/vsCodeImport.ts` — parses a VS Code theme JSON (colors + tokenColors sections) into our token map. Support the ~40 most common VS Code color keys (`editor.background`, `editor.foreground`, `activityBar.background`, `sideBar.background`, etc.). Unsupported keys are listed in the import result for user visibility. | `vsCodeImport.ts` + test, `vsCodeImport.colorMap.ts` (the VS Code → Ouroboros token map) |
| C | **Import UI.** Settings → Appearance → "Import VS Code theme" button opens a modal. Paste JSON OR drag a `.json` file. Preview applies live (token overrides set). Accept → persists as a custom token override set. Reset → clears. Shows warnings for unsupported keys. | `ThemeImportModal.tsx` + test, `SettingsAppearancePane.tsx` (extend — find existing) |
| D | **Accent color picker.** Color-wheel + hex input → sets `--interactive-accent` token via `useTokenOverrides`. Live preview without reload. Reset to theme default. Works independently of theme swap. | `AccentPicker.tsx` + test, extend settings pane |
| E | **Thinking-verb / spinner customization.** Config `theming.thinkingVerbs: string[]` (default `['thinking', 'reasoning', 'cogitating']`). Spinner char set: `theming.spinnerChars: string`. Settings UI: text list editor + presets dropdown. Agent chat thinking indicator consumes these. | `thinkingVerbsConfig.ts`, `ThinkingVerbPicker.tsx`, integrate in existing thinking-indicator component (grep `ThinkingIndicator*`) + tests |
| F | **Per-pane font-family.** Config `theming.fonts.{editor, chat, terminal}`. Settings UI: dropdowns populated from a curated list + "custom font-family" input. Fonts applied via CSS custom properties `--font-editor`, `--font-chat`, `--font-terminal` on the respective pane roots. | `fontPickerOptions.ts`, `PaneFontPicker.tsx` + test, extend Monaco mount to use `--font-editor`, xterm options to use `--font-terminal`, chat CSS to use `--font-chat` |
| G | **Docs + e2e.** `docs/theming.md` with supported VS Code keys, import examples, and known limitations. Playwright spec exercising import → preview → apply. | `docs/theming.md`, `e2e/theme-import.spec.ts` (desktop project) |

**Phase order:** A foundational. B parser independent. C depends on A+B. D independent of B/C (uses A). E independent. F independent. G capstone.

---

## Architecture notes

**Override vs. Full Swap:**
- Theme swap (`useTheme`) replaces the ENTIRE token set (switching from `retro` to `kiro`).
- Override (`useTokenOverrides`, new Phase A) applies AFTER the theme swap, patching specific tokens. This is how the accent picker and VS Code import can work without fighting the theme system.
- Order in `App.tsx`: `useThemeRuntimeBootstrap()` → `useTokenOverrides()`. Overrides win.

**VS Code color map (Phase B):**
~40 entries from VS Code theme → Ouroboros tokens. Examples:
- `editor.background` → `--surface-base`
- `editor.foreground` → `--text-semantic-primary`
- `activityBar.background` → `--surface-panel`
- `sideBar.background` → `--surface-raised`
- `button.background` → `--interactive-accent`
- `focusBorder` → `--border-accent`
- Partial support is fine; unsupported keys listed in the import result.

**Font defaults (Phase F):**
- `--font-editor` default: `var(--font-mono)` (existing).
- `--font-chat` default: `var(--font-ui, sans-serif)`.
- `--font-terminal` default: whatever the current xterm fontFamily is.
- Overrides cascade via CSS custom property; no runtime theme rebuild needed.

---

## Risks

- **VS Code theme variance** — hundreds of theme packages use non-standard keys. Accept partial support; surface a "N of 120 keys applied" result.
- **Performance of live preview** — debounce accent-picker updates at 16ms (one frame) to avoid paint thrash.
- **Font load failure** — if a custom font isn't installed, fall back to the default. Don't block save.
- **Monaco font change** requires calling `editor.updateOptions({ fontFamily })` — integrate carefully to avoid a layout thrash.

---

## Acceptance

- Paste VS Code `Default Dark+.json` → theme applies; UI reflects new colors.
- Spin the accent color wheel → UI updates live (< 16ms delay) without reload.
- Add "ruminating" to thinking verbs → chat thinking indicator rotates it in.
- Set editor font to "JetBrains Mono" → Monaco re-renders with new font; chat + terminal unchanged.
- `npm run build` + `tsc` + lint + vitest all green.

---

## Per-phase commit format

`feat: Wave 35 Phase X — short summary`

```
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
```

Parent pushes once after Phase G.
