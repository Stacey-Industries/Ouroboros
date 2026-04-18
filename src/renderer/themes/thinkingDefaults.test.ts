/**
 * thinkingDefaults.test.ts — Smoke tests for thinkingDefaults constants.
 *
 * @vitest-environment jsdom
 */

import { afterEach, describe, expect, it } from 'vitest';

import {
  DEFAULT_SPINNER_CHARS,
  DEFAULT_THINKING_VERBS,
  SPINNER_PRESETS,
} from './thinkingDefaults';

afterEach(() => {
  // no DOM side-effects to clean up
});

describe('DEFAULT_THINKING_VERBS', () => {
  it('is a non-empty array', () => {
    expect(Array.isArray(DEFAULT_THINKING_VERBS)).toBe(true);
    expect(DEFAULT_THINKING_VERBS.length).toBeGreaterThan(0);
  });

  it('contains "thinking"', () => {
    expect(DEFAULT_THINKING_VERBS).toContain('thinking');
  });

  it('contains only non-empty strings', () => {
    for (const v of DEFAULT_THINKING_VERBS) {
      expect(typeof v).toBe('string');
      expect(v.length).toBeGreaterThan(0);
    }
  });
});

describe('DEFAULT_SPINNER_CHARS', () => {
  it('is a non-empty string', () => {
    expect(typeof DEFAULT_SPINNER_CHARS).toBe('string');
    expect(DEFAULT_SPINNER_CHARS.length).toBeGreaterThan(0);
  });

  it('matches the braille preset', () => {
    const braille = SPINNER_PRESETS.find((p) => p.id === 'braille');
    expect(braille).toBeTruthy();
    expect(DEFAULT_SPINNER_CHARS).toBe(braille?.chars);
  });
});

describe('SPINNER_PRESETS', () => {
  it('is a non-empty array', () => {
    expect(Array.isArray(SPINNER_PRESETS)).toBe(true);
    expect(SPINNER_PRESETS.length).toBeGreaterThan(0);
  });

  it('every preset has id, label, and chars', () => {
    for (const preset of SPINNER_PRESETS) {
      expect(typeof preset.id).toBe('string');
      expect(preset.id.length).toBeGreaterThan(0);
      expect(typeof preset.label).toBe('string');
      expect(preset.label.length).toBeGreaterThan(0);
      expect(typeof preset.chars).toBe('string');
      expect(preset.chars.length).toBeGreaterThan(0);
    }
  });

  it('ids are unique', () => {
    const ids = SPINNER_PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('includes expected presets: braille, dots, line, arc, pulse, square', () => {
    const ids = SPINNER_PRESETS.map((p) => p.id);
    for (const expected of ['braille', 'dots', 'line', 'arc', 'pulse', 'square']) {
      expect(ids).toContain(expected);
    }
  });
});
