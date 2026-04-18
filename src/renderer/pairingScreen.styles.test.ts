/**
 * pairingScreen.styles.test.ts — Smoke tests for pairingScreen style constants.
 *
 * Verifies that the exported constants exist and have the expected shapes.
 * This file is a pure-constants module — tests guard against accidental deletion
 * or breakage of the hardcoded pre-token-system design exception values.
 *
 * Wave 33b Phase E.
 */

import { describe, expect, it } from 'vitest';

import { FIELD_HIGHLIGHT_BORDER, PREFILL_HIGHLIGHT_MS, S } from './pairingScreen.styles';

describe('pairingScreen.styles — constants', () => {
  it('PREFILL_HIGHLIGHT_MS is a positive number', () => {
    expect(typeof PREFILL_HIGHLIGHT_MS).toBe('number');
    expect(PREFILL_HIGHLIGHT_MS).toBeGreaterThan(0);
  });

  it('FIELD_HIGHLIGHT_BORDER is a non-empty string', () => {
    expect(typeof FIELD_HIGHLIGHT_BORDER).toBe('string');
    expect(FIELD_HIGHLIGHT_BORDER.length).toBeGreaterThan(0);
  });
});

describe('pairingScreen.styles — S object', () => {
  it('exports root style with required layout properties', () => {
    expect(S.root.display).toBe('flex');
    expect(S.root.minHeight).toBe('100vh');
  });

  it('exports card style with border-radius', () => {
    expect(typeof S.card.borderRadius).toBe('string');
    expect(S.card.borderRadius.length).toBeGreaterThan(0);
  });

  it('exports field style with boxSizing box-content-box', () => {
    expect(S.field.boxSizing).toBe('border-box');
  });

  it('exports error style with non-empty background', () => {
    expect(typeof S.error.background).toBe('string');
    expect(S.error.background.length).toBeGreaterThan(0);
  });

  it('exports spinner style with animation property', () => {
    expect(typeof S.spinner.animation).toBe('string');
    expect(S.spinner.animation).toContain('spin');
  });

  it('exports buttonDisabled style', () => {
    expect(S.buttonDisabled.opacity).toBeLessThan(1);
  });
});
