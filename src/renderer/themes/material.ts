/**
 * Material variants — baseline polish + palette for the Ouroboros shell.
 *
 * Wave 45 introduces the material-baseline model: the app's intrinsic material
 * (blur, radii, strokes, wash, glows, *and* a default palette) lives here.
 * Themes are optional overlays that override the accent/text channels.
 * When no theme is selected, the variant's own palette is used directly.
 *
 * All wash gradients are transparent so the OS Mica blur shows through on
 * Windows. Components that want an opaque surface must read --material-panel
 * explicitly; the semantic --surface-base / --surface-panel tokens stay
 * transparent.
 */

export type MaterialVariant = 'vapor' | 'prism' | 'warp';

/** Matches Theme['colors'] — the 25 color tokens every palette must define. */
export interface MaterialPalette {
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
}

export interface MaterialTokens {
  blur: string;
  panel: string;
  panelRaised: string;
  editorBg: string;
  composerWash: string;
  titlebarBg: string;
  userBubble: string;
  stroke: string;
  strokeFaint: string;
  strokeInner: string;
  rowActive: string;
  radiusSm: string;
  radiusMd: string;
  radiusChip: string;
  shadowPanel: string;
  shadowPanelSm: string;
  shadowBubble: string;
  shadowInset: string;
  shadowAccent: string;
  /** Background wash — deep chromatic layer; MUST be transparent where possible so Mica bleeds through. */
  bgWash: string;
  /** Accent-mixed glows layered above the wash. */
  bgGlows: string;
  /** Default palette used when no theme is selected (or to fill unspecified keys). */
  palette: MaterialPalette;
}

// Neutral palette fragments shared across variants — only the accent axis varies.
const SHARED_NEUTRAL_DARK: Omit<MaterialPalette,
  | 'accent' | 'accentHover' | 'accentMuted'
  | 'selection' | 'focusRing' | 'termCursor' | 'termSelection'
> = {
  bg: 'transparent',
  bgSecondary: 'transparent',
  bgTertiary: 'rgba(255, 255, 255, 0.05)',
  border: 'rgba(255, 255, 255, 0.09)',
  borderMuted: 'rgba(255, 255, 255, 0.05)',
  text: '#e8e8ed',
  textSecondary: '#b4b4c2',
  textMuted: '#9090a4',
  textFaint: '#6e6e82',
  success: '#3fb950',
  warning: '#d29922',
  error: '#f85149',
  purple: '#bc8cff',
  purpleMuted: 'rgba(188, 140, 255, 0.18)',
  termBg: 'transparent',
  termFg: '#d8d8e0',
};

function paletteWithAccent(accent: string, hover: string, mutedRgba: string): MaterialPalette {
  return {
    ...SHARED_NEUTRAL_DARK,
    accent,
    accentHover: hover,
    accentMuted: mutedRgba,
    selection: mutedRgba,
    focusRing: mutedRgba,
    termCursor: accent,
    termSelection: mutedRgba,
  };
}

const vapor: MaterialTokens = {
  blur: '24px',
  panel: 'rgba(18, 20, 32, 0.35)',
  panelRaised: 'linear-gradient(180deg, rgba(255,255,255,0.08), rgba(255,255,255,0.02))',
  editorBg: 'rgba(10, 12, 24, 0.22)',
  composerWash: 'linear-gradient(180deg, rgba(10,12,18,0) 0%, rgba(10,12,18,0.25) 100%)',
  titlebarBg: 'linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.01))',
  userBubble: 'linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0.015))',
  stroke: 'rgba(255, 255, 255, 0.09)',
  strokeFaint: 'rgba(255, 255, 255, 0.05)',
  strokeInner: 'rgba(255, 255, 255, 0.06)',
  rowActive: 'color-mix(in srgb, var(--palette-accent) 14%, transparent)',
  radiusSm: '10px',
  radiusMd: '12px',
  radiusChip: '6px',
  shadowPanel: '0 12px 40px -12px rgba(0,0,0,0.6), 0 2px 8px rgba(0,0,0,0.35)',
  shadowPanelSm: '0 4px 16px -6px rgba(0,0,0,0.4), 0 1px 2px rgba(0,0,0,0.25)',
  shadowBubble: 'inset 0 1px 0 rgba(255,255,255,0.06), 0 1px 2px rgba(0,0,0,0.25)',
  shadowInset: 'inset 0 1px 0 rgba(255,255,255,0.06)',
  shadowAccent: '0 2px 12px -4px color-mix(in srgb, var(--palette-accent) 60%, transparent)',
  // Fully translucent — Mica provides the base color; radials add chromatic ambience.
  bgWash: [
    'radial-gradient(ellipse at 15% 5%, rgba(30, 60, 120, 0.22) 0%, transparent 55%)',
    'radial-gradient(ellipse at 90% 100%, rgba(20, 80, 90, 0.18) 0%, transparent 50%)',
    'radial-gradient(ellipse at 70% 30%, rgba(90, 40, 120, 0.14) 0%, transparent 60%)',
  ].join(', '),
  bgGlows: [
    'radial-gradient(ellipse at 85% 15%, color-mix(in srgb, var(--palette-accent) 22%, transparent) 0%, transparent 45%)',
    'radial-gradient(ellipse at 15% 85%, color-mix(in srgb, var(--palette-accent) 14%, transparent) 0%, transparent 50%)',
  ].join(', '),
  palette: paletteWithAccent('#818cf8', '#a5b4fc', 'rgba(129, 140, 248, 0.25)'),
};

const prism: MaterialTokens = {
  blur: '16px',
  panel: 'rgba(14, 16, 24, 0.45)',
  panelRaised: 'rgba(22, 24, 34, 0.55)',
  editorBg: 'rgba(8, 10, 16, 0.4)',
  composerWash: 'rgba(10, 12, 18, 0.35)',
  titlebarBg: 'rgba(14, 16, 24, 0.5)',
  userBubble: 'rgba(255,255,255,0.035)',
  stroke: 'rgba(255, 255, 255, 0.10)',
  strokeFaint: 'rgba(255, 255, 255, 0.05)',
  strokeInner: 'rgba(255, 255, 255, 0.04)',
  rowActive: 'color-mix(in srgb, var(--palette-accent) 16%, transparent)',
  radiusSm: '6px',
  radiusMd: '8px',
  radiusChip: '4px',
  shadowPanel: 'inset 0 1px 0 rgba(255,255,255,0.04), 0 8px 24px rgba(0,0,0,0.45)',
  shadowPanelSm: 'inset 0 1px 0 rgba(255,255,255,0.03), 0 2px 8px rgba(0,0,0,0.3)',
  shadowBubble: 'inset 0 0 0 1px rgba(255,255,255,0.04)',
  shadowInset: 'inset 0 1px 0 rgba(255,255,255,0.04)',
  shadowAccent: '0 0 0 1px color-mix(in srgb, var(--palette-accent) 40%, transparent)',
  bgWash: [
    'radial-gradient(ellipse at 80% 20%, color-mix(in srgb, var(--palette-accent) 18%, transparent) 0%, transparent 55%)',
    'radial-gradient(ellipse at 20% 80%, rgba(26, 29, 46, 0.35) 0%, transparent 60%)',
  ].join(', '),
  bgGlows: [
    'radial-gradient(ellipse at 50% 0%, color-mix(in srgb, var(--palette-accent) 18%, transparent) 0%, transparent 50%)',
    'radial-gradient(ellipse at 10% 90%, color-mix(in srgb, var(--palette-accent) 20%, transparent) 0%, transparent 55%)',
  ].join(', '),
  palette: paletteWithAccent('#5eead4', '#99f6e4', 'rgba(94, 234, 212, 0.28)'),
};

const warp: MaterialTokens = {
  blur: '18px',
  panel: 'rgba(10, 18, 14, 0.3)',
  panelRaised: 'linear-gradient(180deg, rgba(57, 255, 90, 0.06), rgba(57,255,90,0.01))',
  editorBg: 'rgba(6, 11, 9, 0.25)',
  composerWash: 'rgba(8, 14, 11, 0.35)',
  titlebarBg: 'rgba(6, 12, 10, 0.5)',
  userBubble: 'rgba(57,255,90,0.05)',
  stroke: 'rgba(57, 255, 90, 0.16)',
  strokeFaint: 'rgba(57, 255, 90, 0.08)',
  strokeInner: 'rgba(57, 255, 90, 0.10)',
  rowActive: 'rgba(57, 255, 90, 0.10)',
  radiusSm: '4px',
  radiusMd: '6px',
  radiusChip: '3px',
  shadowPanel: '0 0 0 1px rgba(57,255,90,0.05), 0 8px 24px rgba(0,0,0,0.6)',
  shadowPanelSm: '0 0 0 1px rgba(57,255,90,0.04), 0 2px 6px rgba(0,0,0,0.4)',
  shadowBubble: 'inset 0 1px 0 rgba(57,255,90,0.05)',
  shadowInset: 'inset 0 1px 0 rgba(57,255,90,0.10)',
  shadowAccent: '0 0 12px rgba(92, 255, 130, 0.4), 0 0 0 1px rgba(92,255,130,0.4)',
  bgWash: [
    'radial-gradient(ellipse at 50% 50%, rgba(0, 40, 30, 0.35) 0%, transparent 65%)',
    'radial-gradient(ellipse at 20% 20%, rgba(57, 255, 90, 0.08) 0%, transparent 45%)',
  ].join(', '),
  bgGlows: [
    'radial-gradient(ellipse at 85% 15%, rgba(57, 255, 90, 0.14) 0%, transparent 45%)',
    'radial-gradient(ellipse at 15% 85%, rgba(57, 255, 90, 0.10) 0%, transparent 50%)',
    'repeating-linear-gradient(0deg, rgba(0,0,0,0.12) 0 1px, transparent 1px 3px)',
  ].join(', '),
  palette: paletteWithAccent('#39ff5a', '#7bff8e', 'rgba(57, 255, 90, 0.30)'),
};

export const MATERIAL_VARIANTS: Record<MaterialVariant, MaterialTokens> = {
  vapor,
  prism,
  warp,
};

export const DEFAULT_MATERIAL_VARIANT: MaterialVariant = 'vapor';

export function getMaterialVariant(id: string | undefined | null): MaterialTokens {
  if (id === 'prism' || id === 'warp' || id === 'vapor') return MATERIAL_VARIANTS[id];
  return MATERIAL_VARIANTS[DEFAULT_MATERIAL_VARIANT];
}

export function isMaterialVariant(id: unknown): id is MaterialVariant {
  return id === 'vapor' || id === 'prism' || id === 'warp';
}
