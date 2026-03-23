/**
 * themeLoader.ts — Reads VS Code theme JSON files from installed extensions
 * and converts them into Ouroboros Theme objects.
 *
 * VS Code themes define ~800 possible color keys. We map the ~15 most
 * semantically important ones to Ouroboros's 26-property color model,
 * then derive the rest from those anchors.
 */

import fs from 'fs/promises';

// ─── Ouroboros Theme shape (mirrors renderer/themes/types.ts) ────────

export interface OuroborosTheme {
  id: string;
  name: string;
  fontFamily: { mono: string; ui: string };
  colors: {
    bg: string;
    bgSecondary: string;
    bgTertiary: string;
    border: string;
    borderMuted: string;
    text: string;
    textSecondary: string;
    textMuted: string;
    textFaint: string;
    accent: string;
    accentHover: string;
    accentMuted: string;
    success: string;
    warning: string;
    error: string;
    purple: string;
    purpleMuted: string;
    selection: string;
    focusRing: string;
    termBg: string;
    termFg: string;
    termCursor: string;
    termSelection: string;
  };
}

// ─── VS Code theme JSON shape (subset we care about) ────────────────

interface VscodeThemeJson {
  name?: string;
  type?: 'dark' | 'light' | 'hcDark' | 'hcLight';
  colors?: Record<string, string>;
  tokenColors?: unknown[];
}

// ─── Color utilities ────────────────────────────────────────────────

/** Parse a hex color (#RGB, #RRGGBB, #RRGGBBAA) into [r,g,b,a] */
function parseHex(hex: string): [number, number, number, number] | null {
  if (!hex || !hex.startsWith('#')) return null;
  const h = hex.slice(1);
  let r: number,
    g: number,
    b: number,
    a = 255;
  if (h.length === 3) {
    r = parseInt(h[0] + h[0], 16);
    g = parseInt(h[1] + h[1], 16);
    b = parseInt(h[2] + h[2], 16);
  } else if (h.length === 6) {
    r = parseInt(h.slice(0, 2), 16);
    g = parseInt(h.slice(2, 4), 16);
    b = parseInt(h.slice(4, 6), 16);
  } else if (h.length === 8) {
    r = parseInt(h.slice(0, 2), 16);
    g = parseInt(h.slice(2, 4), 16);
    b = parseInt(h.slice(4, 6), 16);
    a = parseInt(h.slice(6, 8), 16);
  } else {
    return null;
  }
  if (isNaN(r) || isNaN(g) || isNaN(b) || isNaN(a)) return null;
  return [r, g, b, a];
}

/** Lighten a hex color by a factor (0–1) */
function lighten(hex: string, factor: number): string {
  const rgba = parseHex(hex);
  if (!rgba) return hex;
  const [r, g, b] = rgba;
  const lr = Math.min(255, Math.round(r + (255 - r) * factor));
  const lg = Math.min(255, Math.round(g + (255 - g) * factor));
  const lb = Math.min(255, Math.round(b + (255 - b) * factor));
  return `#${lr.toString(16).padStart(2, '0')}${lg.toString(16).padStart(2, '0')}${lb.toString(16).padStart(2, '0')}`;
}

/** Darken a hex color by a factor (0–1) */
function darken(hex: string, factor: number): string {
  const rgba = parseHex(hex);
  if (!rgba) return hex;
  const [r, g, b] = rgba;
  const dr = Math.round(r * (1 - factor));
  const dg = Math.round(g * (1 - factor));
  const db = Math.round(b * (1 - factor));
  return `#${dr.toString(16).padStart(2, '0')}${dg.toString(16).padStart(2, '0')}${db.toString(16).padStart(2, '0')}`;
}

/** Make a color semi-transparent */
function withAlpha(hex: string, alpha: number): string {
  const rgba = parseHex(hex);
  if (!rgba) return hex;
  const [r, g, b] = rgba;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// ─── Core mapping: VS Code → Ouroboros ──────────────────────────────

/** First defined color from a VS Code colors map for the given keys. */
function pick(colorMap: Map<string, string>, ...keys: string[]): string | undefined {
  for (const k of keys) {
    const v = colorMap.get(k);
    if (v) return v;
  }
  return undefined;
}

function defaultBg(isDark: boolean): string {
  return isDark ? '#1e1e2e' : '#ffffff';
}
function defaultFg(isDark: boolean): string {
  return isDark ? '#cdd6f4' : '#1e1e1e';
}
function defaultAccent(isDark: boolean): string {
  return isDark ? '#818cf8' : '#0078d4';
}

function mapSurfaceColors(cm: Map<string, string>, isDark: boolean, bg: string) {
  const bgSecondary =
    pick(cm, 'sideBar.background', 'editorGroupHeader.tabsBackground', 'activityBar.background') ??
    (isDark ? lighten(bg, 0.04) : darken(bg, 0.03));
  const bgTertiary =
    pick(cm, 'input.background', 'editorWidget.background', 'dropdown.background') ??
    (isDark ? lighten(bg, 0.1) : darken(bg, 0.06));
  const border =
    pick(cm, 'panel.border', 'sideBar.border', 'editorGroup.border', 'contrastBorder') ??
    (isDark ? lighten(bg, 0.18) : darken(bg, 0.15));
  const borderMuted =
    pick(cm, 'editorIndentGuide.background', 'tree.indentGuidesStroke') ??
    (isDark ? lighten(bg, 0.1) : darken(bg, 0.08));
  return { bgSecondary, bgTertiary, border, borderMuted };
}

function mapAnchorsAndSurfaces(cm: Map<string, string>, isDark: boolean) {
  const bg = pick(cm, 'editor.background', 'editorPane.background') ?? defaultBg(isDark);
  const fg = pick(cm, 'editor.foreground', 'foreground') ?? defaultFg(isDark);
  const accent =
    pick(cm, 'focusBorder', 'button.background', 'progressBar.background', 'textLink.foreground') ??
    defaultAccent(isDark);
  return { bg, fg, accent, ...mapSurfaceColors(cm, isDark, bg) };
}

function mapTextColors(cm: Map<string, string>, isDark: boolean, bg: string, fg: string) {
  return {
    text: fg,
    textSecondary:
      pick(cm, 'descriptionForeground', 'sideBar.foreground') ??
      (isDark ? lighten(bg, 0.55) : darken(bg, 0.45)),
    textMuted:
      pick(cm, 'editorLineNumber.foreground', 'tab.inactiveForeground') ??
      (isDark ? lighten(bg, 0.3) : darken(bg, 0.3)),
    textFaint:
      pick(cm, 'editorWhitespace.foreground') ?? (isDark ? lighten(bg, 0.18) : darken(bg, 0.15)),
  };
}

function mapStatusColors(cm: Map<string, string>) {
  return {
    success:
      pick(cm, 'terminal.ansiGreen', 'notificationsInfoIcon.foreground', 'testing.iconPassed') ??
      '#34d399',
    warning:
      pick(cm, 'terminal.ansiYellow', 'editorWarning.foreground', 'list.warningForeground') ??
      '#fbbf24',
    error:
      pick(
        cm,
        'terminal.ansiRed',
        'editorError.foreground',
        'errorForeground',
        'list.errorForeground',
      ) ?? '#f87171',
    purple: pick(cm, 'terminal.ansiMagenta', 'terminal.ansiBrightMagenta') ?? '#a78bfa',
  };
}

function mapTerminalColors(cm: Map<string, string>, accent: string, bg: string, fg: string) {
  return {
    termBg: pick(cm, 'terminal.background') ?? darken(bg, 0.15),
    termFg: pick(cm, 'terminal.foreground') ?? lighten(fg, 0.05),
    termCursor: pick(cm, 'terminalCursor.foreground') ?? accent,
    termSelection: pick(cm, 'terminal.selectionBackground') ?? withAlpha(accent, 0.3),
  };
}

function mapSemanticColors(cm: Map<string, string>, accent: string, bg: string, fg: string) {
  const accentHover =
    pick(cm, 'button.hoverBackground', 'textLink.activeForeground') ?? lighten(accent, 0.15);
  const selection = pick(cm, 'editor.selectionBackground') ?? withAlpha(accent, 0.25);
  const focusRing = pick(cm, 'focusBorder') ?? withAlpha(accent, 0.5);
  const { success, warning, error, purple } = mapStatusColors(cm);
  const termColors = mapTerminalColors(cm, accent, bg, fg);
  return {
    accentHover,
    accentMuted: withAlpha(accent, 0.15),
    success,
    warning,
    error,
    purple,
    purpleMuted: withAlpha(purple, 0.2),
    selection,
    focusRing,
    ...termColors,
  };
}

function mapVscodeColors(vc: Record<string, string>, isDark: boolean): OuroborosTheme['colors'] {
  const cm = new Map(Object.entries(vc));
  const anchors = mapAnchorsAndSurfaces(cm, isDark);
  const textColors = mapTextColors(cm, isDark, anchors.bg, anchors.fg);
  const semanticColors = mapSemanticColors(cm, anchors.accent, anchors.bg, anchors.fg);
  return { ...anchors, ...textColors, ...semanticColors };
}

// ─── Public API ─────────────────────────────────────────────────────

/**
 * Read a VS Code theme JSON file and convert it to an Ouroboros Theme.
 *
 * @param themeJsonPath Absolute path to the .json theme file
 * @param extensionId   Extension ID (used to namespace the theme id)
 * @param label         Display label from the extension's contributes.themes
 * @param uiTheme       VS Code uiTheme string (vs-dark, vs-light, hc-dark, hc-light)
 */
export async function loadVscodeTheme(
  themeJsonPath: string,
  extensionId: string,
  label: string,
  uiTheme: string,
): Promise<OuroborosTheme> {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- themeJsonPath from extension's contributed path
  const raw = await fs.readFile(themeJsonPath, 'utf-8');
  const themeJson = JSON.parse(raw) as VscodeThemeJson;

  const isDark = uiTheme !== 'vs' && uiTheme !== 'vs-light' && uiTheme !== 'hcLight';
  const colors = themeJson.colors ?? {};
  const themeName = label || themeJson.name || extensionId;

  return {
    id: `ext:${extensionId}:${slugify(themeName)}`,
    name: themeName,
    fontFamily: {
      mono: '"Geist Mono", "JetBrains Mono", monospace',
      ui: '"Inter", system-ui, -apple-system, sans-serif',
    },
    colors: mapVscodeColors(colors, isDark),
  };
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Load all themes contributed by an installed extension.
 * Returns an empty array if the extension has no theme contributions.
 */
export async function loadExtensionThemes(
  extensionId: string,
  themeContributions: Array<{ label: string; uiTheme: string; path: string }>,
): Promise<OuroborosTheme[]> {
  const themes: OuroborosTheme[] = [];

  for (const contrib of themeContributions) {
    try {
      const theme = await loadVscodeTheme(
        contrib.path,
        extensionId,
        contrib.label,
        contrib.uiTheme,
      );
      themes.push(theme);
    } catch {
      // Skip themes that fail to load (missing file, bad JSON, etc.)
    }
  }

  return themes;
}
