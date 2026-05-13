# Theming — Customization Reference

Ouroboros supports four independent theming dimensions: full VS Code theme import, accent color, thinking-verb / spinner, and per-pane fonts. Each can be changed independently; they compose on top of the active base theme without replacing it.

---

## Overview

| Customization | Settings location | Persists |
|---|---|---|
| Base theme (preset) | Settings → Appearance → Theme | Per workspace |
| VS Code theme import | Settings → Appearance → VS Code Theme Import | As token overrides in config |
| Accent color | Settings → Appearance → Accent Color | Per workspace |
| Thinking verbs / spinner | Settings → Appearance → Thinking Indicator | Per workspace |
| Per-pane fonts | Settings → Appearance → Fonts | Per workspace |

All overrides are stored in the app config and survive restarts. Each section has a **Reset to defaults** button that clears its overrides independently.

---

## VS Code Theme Import

### How to import

1. Open **Settings** (⌘, / Ctrl+,) and navigate to **Appearance**.
2. Scroll to **VS Code Theme Import** and click **Import VS Code theme**.
3. In the modal that appears, paste the full contents of a VS Code `.json` theme file into the text area, or switch to the **Upload** tab and drag a `.json` file.
4. Click **Import**. A summary appears showing how many keys were applied.
5. The preview is live — the IDE colors update immediately.
6. Click **Keep** to persist the import, **Cancel** to revert to the previous state, or **Reset** to clear the parsed result and start over.

A VS Code theme JSON must have a top-level `colors` object. Example minimal structure:

```json
{
  "name": "My Theme",
  "type": "dark",
  "colors": {
    "editor.background": "#1e1e2e",
    "editor.foreground": "#cdd6f4",
    "button.background": "#cba6f7"
  }
}
```

### Partial support note

Ouroboros maps approximately 40 VS Code color keys to its own design token set. Keys that are not in the map are listed as **unsupported** in the import summary — they are safely ignored. A VS Code theme typically defines 100–200 keys, so seeing unsupported keys in the summary is expected.

### Supported VS Code keys

The table below shows every key that Ouroboros currently maps. The **Ouroboros token** column names the CSS custom property that the key controls.

| VS Code key | Ouroboros token |
|---|---|
| `editor.background` | `--surface-base` |
| `editor.foreground` | `--text-primary` |
| `editor.lineHighlightBackground` | `--surface-hover` |
| `editor.selectionBackground` | `--interactive-selection` |
| `editorCursor.foreground` | `--interactive-accent` |
| `editorWidget.background` | `--surface-overlay` |
| `editorWidget.border` | `--border-default` |
| `activityBar.background` | `--surface-panel` |
| `activityBar.foreground` | `--text-primary` |
| `sideBar.background` | `--surface-raised` |
| `sideBar.foreground` | `--text-primary` |
| `sideBarSectionHeader.background` | `--surface-panel` |
| `statusBar.background` | `--surface-panel` |
| `statusBar.foreground` | `--text-secondary` |
| `titleBar.activeBackground` | `--surface-panel` |
| `titleBar.activeForeground` | `--text-primary` |
| `tab.activeBackground` | `--surface-base` |
| `tab.activeForeground` | `--text-primary` |
| `tab.inactiveBackground` | `--surface-panel` |
| `tab.inactiveForeground` | `--text-muted` |
| `button.background` | `--interactive-accent` |
| `button.foreground` | `--text-on-accent` |
| `button.hoverBackground` | `--interactive-hover` |
| `input.background` | `--surface-inset` |
| `input.foreground` | `--text-primary` |
| `input.border` | `--border-subtle` |
| `focusBorder` | `--border-accent` |
| `foreground` | `--text-primary` |
| `descriptionForeground` | `--text-secondary` |
| `errorForeground` | `--status-error` |
| `dropdown.background` | `--surface-overlay` |
| `dropdown.foreground` | `--text-primary` |
| `list.activeSelectionBackground` | `--interactive-selection` |
| `list.activeSelectionForeground` | `--text-primary` |
| `list.hoverBackground` | `--surface-hover` |
| `scrollbarSlider.background` | `--surface-scroll-thumb` |
| `scrollbarSlider.hoverBackground` | `--surface-scroll-thumb` |
| `scrollbarSlider.activeBackground` | `--surface-scroll-thumb` |
| `badge.background` | `--interactive-accent-subtle` |
| `badge.foreground` | `--text-on-accent` |
| `notifications.background` | `--surface-overlay` |
| `notifications.foreground` | `--text-primary` |

### Limitations

- **Syntax highlighting** (`tokenColors` / `semanticTokenColors`) is not imported. Monaco continues to use its own language server token coloring. See the Known Limitations section below.
- **Alpha channels** are stripped from 8-digit hex values (`#RRGGBBAA` → `#RRGGBB`). A warning is shown in the summary for each key where this occurs. Per-token alpha is not supported.
- **`workbench.colorCustomizations` format** is not supported. Only full VS Code theme JSON with a top-level `colors` field is accepted.

---

## Accent Color Picker

The accent color picker lets you change the app's primary interactive color — buttons, focus rings, active tab indicators — independently of the base theme.

1. Open **Settings → Appearance → Accent Color**.
2. Use the color wheel to pick a hue, or type a hex value directly.
3. The change is live — the accent updates on every interaction without a reload.
4. Click **Reset to theme default** to revert the accent to whatever the active base theme defines.

Accent color changes are stored as a single token override (`--interactive-accent`) and compose cleanly with VS Code theme imports. If both are set, the accent picker wins for that token.

---

## Thinking-Verb and Spinner Customization

The thinking indicator shown in the agent chat while Claude is working rotates through a list of verbs and displays a spinner animation.

### Default verbs

`thinking`, `reasoning`, `cogitating`, `pondering`, `musing`, `deliberating`, `analyzing`, `considering`

### Customizing verbs

1. Open **Settings → Appearance → Thinking Indicator**.
2. The verb list shows all active verbs. Click the **+** button to add a verb, or the **×** beside any verb to remove it.
3. To use a single fixed verb instead of rotating, enable the **Override (single verb)** toggle and type your preferred verb in the text field.
4. Click **Reset verbs** to restore the default list.

### Spinner presets

The spinner animation is driven by a sequence of characters. Six presets are provided:

| Preset | Characters |
|---|---|
| Braille (default) | `⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏` |
| Dots | `.oO°Oo.` |
| Line | `\|/—\\` |
| Arc | `◜◝◞◟` |
| Pulse | `●○` |
| Square | `◰◳◲◱` |

Select a preset from the **Spinner** dropdown, or type a custom character sequence directly.

---

## Per-Pane Fonts

Editor, chat, and terminal font families can be set independently.

### Available panes

| Pane | Setting key | CSS variable |
|---|---|---|
| Editor (Monaco) | `theming.fonts.editor` | `--font-editor` |
| Chat | `theming.fonts.chat` | `--font-chat` |
| Terminal (xterm) | `theming.fonts.terminal` | `--font-terminal` |

### How to change

1. Open **Settings → Appearance → Fonts**.
2. Each pane has a dropdown with a curated font list and a **Custom font-family** text input at the bottom.
3. Selecting from the dropdown or typing a custom value applies the font immediately.
4. Click **Reset** next to any pane to revert that pane to its default.

### Curated font list

**Monospaced (editor and terminal):** System default, JetBrains Mono, Fira Code, Cascadia Code, SF Mono, Iosevka, Menlo, Consolas.

**UI (chat):** System default, Inter, System UI, IBM Plex Sans, SF Pro, Segoe UI.

### Font availability note

Fonts must be installed on your system. Ouroboros does not bundle or install fonts. If a selected font is not installed, the browser's CSS fallback chain applies (typically the system monospace or sans-serif font). The dropdown label remains set to your chosen font so the preference is preserved if the font is later installed.

---

## Reset to Defaults

Each customization section has an independent reset. Resets are non-destructive — they only clear that section's overrides; other sections are unaffected.

| Reset button | Effect |
|---|---|
| Reset overrides (VS Code import) | Clears all custom token overrides loaded from VS Code themes |
| Reset to theme default (accent) | Restores the accent color defined by the active base theme |
| Reset verbs | Restores the eight default thinking verbs |
| Reset (per-pane font) | Restores that pane's font to the base theme default |

---

## Known Limitations

- **Monaco syntax highlighting** — VS Code theme `tokenColors` are not yet imported. Syntax token colors (keywords, strings, comments) remain controlled by the Monaco built-in theme regardless of which VS Code theme is imported. This is planned for a future wave.
- **Font installation** — The app does not bundle or install fonts. Fonts listed in the curated picker must already be installed on the user's OS. Uninstalled fonts fall back silently via CSS.
- **Alpha channel stripping** — VS Code themes that specify 8-digit hex colors (`#RRGGBBAA`) have the alpha stripped during import. Semi-transparent color values are not supported in the current token system.
- **One active VS Code import at a time** — Importing a second VS Code theme replaces the first. There is no layering of multiple imported themes.
