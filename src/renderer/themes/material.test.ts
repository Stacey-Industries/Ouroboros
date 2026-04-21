import { describe, expect, it } from 'vitest';

import {
  DEFAULT_MATERIAL_VARIANT,
  getMaterialVariant,
  isMaterialVariant,
  MATERIAL_VARIANTS,
  type MaterialTokens,
  type MaterialVariant,
} from './material';

const REQUIRED_TOKEN_KEYS: Array<keyof MaterialTokens> = [
  'blur',
  'panel',
  'panelRaised',
  'editorBg',
  'composerWash',
  'titlebarBg',
  'userBubble',
  'stroke',
  'strokeFaint',
  'strokeInner',
  'rowActive',
  'radiusSm',
  'radiusMd',
  'radiusChip',
  'shadowPanel',
  'shadowPanelSm',
  'shadowBubble',
  'shadowInset',
  'shadowAccent',
  'bgWash',
  'bgGlows',
];

describe('material variants', () => {
  it('exposes the three documented variants', () => {
    expect(Object.keys(MATERIAL_VARIANTS).sort()).toEqual(['prism', 'vapor', 'warp']);
  });

  it('default variant resolves to vapor', () => {
    expect(DEFAULT_MATERIAL_VARIANT).toBe('vapor');
  });

  it('every variant defines all required tokens as non-empty strings', () => {
    for (const id of Object.keys(MATERIAL_VARIANTS) as MaterialVariant[]) {
      const tokens = MATERIAL_VARIANTS[id];
      for (const key of REQUIRED_TOKEN_KEYS) {
        expect(tokens[key], `${id}.${key}`).toBeTypeOf('string');
        expect(tokens[key].length, `${id}.${key} not empty`).toBeGreaterThan(0);
      }
    }
  });

  it('cross-variant ratios match the spec (panel opacity + radius)', () => {
    expect(MATERIAL_VARIANTS.vapor.radiusMd).toBe('12px');
    expect(MATERIAL_VARIANTS.prism.radiusMd).toBe('8px');
    expect(MATERIAL_VARIANTS.warp.radiusMd).toBe('6px');
    expect(MATERIAL_VARIANTS.vapor.blur).toBe('24px');
    expect(MATERIAL_VARIANTS.prism.blur).toBe('16px');
    expect(MATERIAL_VARIANTS.warp.blur).toBe('18px');
  });

  it('getMaterialVariant returns the matching variant', () => {
    expect(getMaterialVariant('prism')).toBe(MATERIAL_VARIANTS.prism);
    expect(getMaterialVariant('warp')).toBe(MATERIAL_VARIANTS.warp);
    expect(getMaterialVariant('vapor')).toBe(MATERIAL_VARIANTS.vapor);
  });

  it('getMaterialVariant falls back to default for unknown ids', () => {
    expect(getMaterialVariant(undefined)).toBe(MATERIAL_VARIANTS[DEFAULT_MATERIAL_VARIANT]);
    expect(getMaterialVariant(null)).toBe(MATERIAL_VARIANTS[DEFAULT_MATERIAL_VARIANT]);
    expect(getMaterialVariant('bogus')).toBe(MATERIAL_VARIANTS[DEFAULT_MATERIAL_VARIANT]);
    expect(getMaterialVariant('')).toBe(MATERIAL_VARIANTS[DEFAULT_MATERIAL_VARIANT]);
  });

  it('isMaterialVariant narrows correctly', () => {
    expect(isMaterialVariant('vapor')).toBe(true);
    expect(isMaterialVariant('prism')).toBe(true);
    expect(isMaterialVariant('warp')).toBe(true);
    expect(isMaterialVariant('glass')).toBe(false);
    expect(isMaterialVariant(null)).toBe(false);
    expect(isMaterialVariant(undefined)).toBe(false);
    expect(isMaterialVariant(42)).toBe(false);
  });
});
