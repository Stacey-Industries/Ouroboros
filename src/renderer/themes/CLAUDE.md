<!-- claude-md-auto:start -->

The CLAUDE.md already exists for this directory (shown in the system reminder). The content is current and accurate — it covers all the key files, the color token contract, extension theme registration, the mutable `customTheme` singleton, and the add-a-theme checklist.

No changes needed.

<!-- claude-md-auto:end -->

<!-- claude-md-manual:preserved -->

# Themes — Runtime theme definitions and registry

## Key Files

| File                              | Role                                                                                                                                                        |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `types.ts`                        | `Theme` interface — colors, fonts, optional effects (`scanlines`, `glowText`), optional `backgroundGradient`                                                |
| `index.ts`                        | Theme registry — exports `themes` record, `getTheme()`, `themeList`, and extension theme registration (`registerExtensionTheme`/`unregisterExtensionTheme`) |
| `retro.ts`                        | Green-on-black CRT theme — only theme using `effects` (scanlines + glow) and a repeating-linear-gradient background                                         |
| `modern.ts`                       | Default theme (`defaultThemeId = 'modern'`). Zinc palette, indigo accent. Also the base for `customTheme`.                                                  |
| `light.ts`                        | Light mode — white bg, indigo accent                                                                                                                        |
| `high-contrast.ts`                | Accessibility theme — pure black bg, white text, teal accent, higher contrast ratios                                                                        |
| `warp.ts`, `cursor.ts`, `kiro.ts` | Branded themes inspired by other IDE tools                                                                                                                  |

## How Themes Work

1. Each theme file exports a `Theme` object with `id`, `name`, `fontFamily` (mono + ui), and `colors` (25 tokens)
2. `index.ts` collects all themes into a `Record<string, Theme>` and exposes `getTheme(id)` with fallback to `modern`
3. `useTheme` hook (in `../hooks/`) applies the active theme by setting CSS custom properties on `:root` — components never read theme objects directly
4. Extension themes from VS Code extensions are registered at runtime via `registerExtensionTheme()` and added to the `themes` record

## Color Token Contract

Every theme must define all 25 color tokens in `Theme.colors`. The tokens map to CSS vars consumed by Tailwind and components:

- **Surfaces**: `bg`, `bgSecondary`, `bgTertiary` → `var(--bg)`, `var(--bg-secondary)`, `var(--bg-tertiary)`
- **Text**: `text`, `textSecondary`, `textMuted`, `textFaint` → `var(--text)`, etc.
- **Accent**: `accent`, `accentHover`, `accentMuted` → `var(--accent)`, etc.
- **Semantic**: `success`, `warning`, `error`, `purple`, `purpleMuted`
- **Terminal**: `termBg`, `termFg`, `termCursor`, `termSelection` → `var(--term-bg)`, etc.
- **Interactive**: `border`, `borderMuted`, `selection`, `focusRing`

## Adding a New Theme

1. Create `<name>.ts` exporting a `Theme` object — copy `modern.ts` as a template
2. Import and add to `themes` record and `themeList` array in `index.ts`
3. The theme automatically appears in the settings UI theme picker

## Gotchas

- `customTheme` is a mutable singleton that gets its `colors` overwritten at runtime by `useTheme` — don't treat it as immutable
- `themeList` deliberately excludes `customTheme` — it only shows in the picker when the user has saved custom colors
- Theme `id` must match the key in the `themes` record (e.g. `id: 'high-contrast'` → `themes['high-contrast']`)
- `effects` is only used by `retro` theme — the renderer checks `theme.effects?.scanlines` to conditionally apply CSS overlay
