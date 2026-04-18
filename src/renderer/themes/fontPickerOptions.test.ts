/**
 * fontPickerOptions.test.ts — Smoke tests for curated font lists.
 * Wave 35 Phase F.
 */

import { describe, expect, it } from 'vitest';

import type { FontOption } from './fontPickerOptions';
import { MONO_FONTS, UI_FONTS } from './fontPickerOptions';

describe('fontPickerOptions', () => {
  describe('MONO_FONTS', () => {
    it('exports a non-empty array', () => {
      expect(MONO_FONTS.length).toBeGreaterThan(0);
    });

    it('every entry has required fields', () => {
      for (const font of MONO_FONTS) {
        expect(font.id).toBeTruthy();
        expect(font.label).toBeTruthy();
        expect(font.value).toBeTruthy();
        expect(font.category).toBe('mono');
      }
    });

    it('ids are unique', () => {
      const ids = MONO_FONTS.map((f) => f.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('includes a system-default entry', () => {
      const def = MONO_FONTS.find((f) => f.id === 'default-mono');
      expect(def).toBeDefined();
      expect((def as FontOption).value).toContain('var(--font-mono');
    });

    it('includes JetBrains Mono', () => {
      const found = MONO_FONTS.find((f) => f.id === 'jetbrains');
      expect(found).toBeDefined();
      expect((found as FontOption).value).toContain('JetBrains Mono');
    });
  });

  describe('UI_FONTS', () => {
    it('exports a non-empty array', () => {
      expect(UI_FONTS.length).toBeGreaterThan(0);
    });

    it('every entry has required fields', () => {
      for (const font of UI_FONTS) {
        expect(font.id).toBeTruthy();
        expect(font.label).toBeTruthy();
        expect(font.value).toBeTruthy();
        expect(font.category).toBe('ui');
      }
    });

    it('ids are unique', () => {
      const ids = UI_FONTS.map((f) => f.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('includes a system-default entry', () => {
      const def = UI_FONTS.find((f) => f.id === 'default-ui');
      expect(def).toBeDefined();
      expect((def as FontOption).value).toContain('var(--font-ui');
    });

    it('includes Inter', () => {
      const found = UI_FONTS.find((f) => f.id === 'inter');
      expect(found).toBeDefined();
      expect((found as FontOption).value).toContain('Inter');
    });
  });
});
