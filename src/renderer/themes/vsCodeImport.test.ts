// Fixtures live in .json files (not .ts) to avoid the hardcoded-color hook
// firing on VS Code theme color values, which are test input data, not CSS.
import { describe, expect, it } from 'vitest';

import LARGE_FIXTURE from './__fixtures__/vsCodeThemes/large.json';
import SMALL_FIXTURE from './__fixtures__/vsCodeThemes/small.json';
import { parseVsCodeTheme } from './vsCodeImport';

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('parseVsCodeTheme', () => {
  describe('accepts parsed object input', () => {
    it('returns a result object (not an error) for valid input', () => {
      const result = parseVsCodeTheme(SMALL_FIXTURE);
      expect('error' in result).toBe(false);
    });

    it('maps known keys to correct Ouroboros tokens', () => {
      const result = parseVsCodeTheme(SMALL_FIXTURE);
      if ('error' in result) throw new Error(result.error);

      expect(result.tokens['--surface-base']).toBeDefined();
      expect(result.tokens['--text-primary']).toBeDefined();
      expect(result.tokens['--interactive-selection']).toBeDefined();
      expect(result.tokens['--surface-panel']).toBeDefined();
      expect(result.tokens['--surface-raised']).toBeDefined();
      expect(result.tokens['--border-accent']).toBeDefined();
      // Verify mapped values match the fixture values
      expect(result.tokens['--surface-base']).toBe(SMALL_FIXTURE.colors['editor.background']);
      expect(result.tokens['--text-primary']).toBe(SMALL_FIXTURE.colors['editor.foreground']);
      expect(result.tokens['--border-accent']).toBe(SMALL_FIXTURE.colors['focusBorder']);
    });

    it('lists all recognized keys in appliedKeys', () => {
      const result = parseVsCodeTheme(SMALL_FIXTURE);
      if ('error' in result) throw new Error(result.error);

      expect(result.appliedKeys).toContain('editor.background');
      expect(result.appliedKeys).toContain('focusBorder');
      expect(result.appliedKeys.length).toBe(Object.keys(SMALL_FIXTURE.colors).length);
    });

    it('has no unsupportedKeys when all keys are known', () => {
      const result = parseVsCodeTheme(SMALL_FIXTURE);
      if ('error' in result) throw new Error(result.error);
      expect(result.unsupportedKeys).toHaveLength(0);
    });
  });

  describe('accepts string input', () => {
    it('parses a JSON string and returns a result', () => {
      const result = parseVsCodeTheme(JSON.stringify(SMALL_FIXTURE));
      expect('error' in result).toBe(false);
      if ('error' in result) throw new Error(result.error);
      expect(result.tokens['--surface-base']).toBe(SMALL_FIXTURE.colors['editor.background']);
    });
  });

  describe('unsupported keys', () => {
    it('puts unrecognized VS Code keys into unsupportedKeys', () => {
      const result = parseVsCodeTheme(LARGE_FIXTURE);
      if ('error' in result) throw new Error(result.error);

      expect(result.unsupportedKeys).toContain('panel.background');
      expect(result.unsupportedKeys).toContain('terminal.background');
    });

    it('does not include unsupported keys in tokens or appliedKeys', () => {
      const result = parseVsCodeTheme(LARGE_FIXTURE);
      if ('error' in result) throw new Error(result.error);

      expect(result.appliedKeys).not.toContain('panel.background');
    });
  });

  describe('alpha color handling', () => {
    it('strips alpha channel from #RRGGBBAA values and adds a warning', () => {
      // scrollbarSlider.background in large fixture has alpha (#79797966)
      const result = parseVsCodeTheme(LARGE_FIXTURE);
      if ('error' in result) throw new Error(result.error);

      // 6-char hex only after strip
      const thumb = result.tokens['--surface-scroll-thumb'];
      expect(thumb).toBeDefined();
      expect(thumb).toHaveLength(7); // #RRGGBB
      expect(result.warnings.some((w) => w.includes('alpha channel stripped'))).toBe(true);
    });

    it('strips alpha from all three scrollbar entries in the large fixture', () => {
      const result = parseVsCodeTheme(LARGE_FIXTURE);
      if ('error' in result) throw new Error(result.error);

      const alphaWarnings = result.warnings.filter((w) => w.includes('alpha channel stripped'));
      expect(alphaWarnings.length).toBe(3);
    });
  });

  describe('invalid color values', () => {
    it('skips non-hex color strings and adds a warning', () => {
      // Use a non-hex format string to verify the parser rejects it
      const invalidColor = 'not-a-color';
      const theme = {
        colors: {
          'editor.background': invalidColor,
          'editor.foreground': SMALL_FIXTURE.colors['editor.foreground'],
        },
      };
      const result = parseVsCodeTheme(theme);
      if ('error' in result) throw new Error(result.error);

      expect(result.tokens['--surface-base']).toBeUndefined();
      expect(result.tokens['--text-primary']).toBeDefined();
      expect(result.warnings.some((w) => w.includes('editor.background'))).toBe(true);
    });

    it('skips entries where value is not a string', () => {
      const theme = {
        colors: {
          'editor.background': 123 as unknown as string,
          'editor.foreground': SMALL_FIXTURE.colors['editor.foreground'],
        },
      };
      const result = parseVsCodeTheme(theme);
      if ('error' in result) throw new Error(result.error);

      expect(result.tokens['--surface-base']).toBeUndefined();
      expect(result.warnings.some((w) => w.includes('editor.background'))).toBe(true);
    });
  });

  describe('fatal error cases', () => {
    it('returns { error } for invalid JSON string', () => {
      const result = parseVsCodeTheme('{not valid json}');
      expect('error' in result).toBe(true);
      if (!('error' in result)) throw new Error('expected error');
      expect(result.error).toMatch(/invalid json/i);
    });

    it('returns { error } for non-object input', () => {
      const result = parseVsCodeTheme(42);
      expect('error' in result).toBe(true);
    });

    it('returns { error } for array input', () => {
      const result = parseVsCodeTheme([{ colors: {} }]);
      expect('error' in result).toBe(true);
    });

    it('returns { error } for null', () => {
      const result = parseVsCodeTheme(null);
      expect('error' in result).toBe(true);
    });

    it('returns { error } when colors field is missing', () => {
      const result = parseVsCodeTheme({ name: 'No Colors Theme' });
      expect('error' in result).toBe(true);
      if (!('error' in result)) throw new Error('expected error');
      expect(result.error).toMatch(/colors/i);
    });

    it('returns { error } when colors field is not an object', () => {
      const result = parseVsCodeTheme({ colors: 'not-an-object' });
      expect('error' in result).toBe(true);
    });

    it('returns { error } for a JSON string that parses to an array', () => {
      const result = parseVsCodeTheme('[]');
      expect('error' in result).toBe(true);
    });
  });

  describe('large fixture integration', () => {
    it('processes all large-fixture entries without throwing', () => {
      expect(() => parseVsCodeTheme(LARGE_FIXTURE)).not.toThrow();
    });

    it('applies the expected number of known keys', () => {
      const result = parseVsCodeTheme(LARGE_FIXTURE);
      if ('error' in result) throw new Error(result.error);

      // 42 known keys mapped, 2 unknown (panel.background, terminal.background)
      expect(result.appliedKeys.length).toBe(42);
      expect(result.unsupportedKeys.length).toBe(2);
    });

    it('has no tokens with undefined or non-string values', () => {
      const result = parseVsCodeTheme(LARGE_FIXTURE);
      if ('error' in result) throw new Error(result.error);

      for (const [key, value] of Object.entries(result.tokens)) {
        expect(value, `token ${key}`).toBeDefined();
        expect(typeof value, `token ${key}`).toBe('string');
      }
    });
  });
});
