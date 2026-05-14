import { describe, expect, it } from 'vitest';

import { TERMINAL_ADDONS, type TerminalAddonEntry } from './terminalAddonManifest';

const EXPECTED_PACKAGES = [
  '@xterm/addon-clipboard',
  '@xterm/addon-fit',
  '@xterm/addon-image',
  '@xterm/addon-progress',
  '@xterm/addon-search',
  '@xterm/addon-serialize',
  '@xterm/addon-unicode-graphemes',
  '@xterm/addon-web-links',
  '@xterm/addon-webgl',
] as const;

describe('terminalAddonManifest', () => {
  it('enumerates every @xterm/addon-* package the project depends on', () => {
    const names = TERMINAL_ADDONS.map((a) => a.packageName).sort();
    expect(names).toEqual([...EXPECTED_PACKAGES].sort());
  });

  it('declares the required shape for every entry', () => {
    for (const entry of TERMINAL_ADDONS) {
      expect(entry.packageName).toMatch(/^@xterm\/addon-/);
      expect(entry.exportName).toMatch(/^[A-Z][A-Za-z]+Addon$/);
      expect(['pre-open', 'post-open']).toContain(entry.loadOrder);
      expect(typeof entry.required).toBe('boolean');
      expect(entry.purpose.length).toBeGreaterThan(0);
    }
  });

  it('marks WebGL as post-open per Wave 88 Decision 1', () => {
    const webgl = TERMINAL_ADDONS.find((a) => a.packageName === '@xterm/addon-webgl');
    expect(webgl).toBeDefined();
    expect(webgl?.loadOrder).toBe('post-open');
  });

  it('marks fit and search as required', () => {
    const fit = TERMINAL_ADDONS.find((a) => a.packageName === '@xterm/addon-fit');
    const search = TERMINAL_ADDONS.find((a) => a.packageName === '@xterm/addon-search');
    expect(fit?.required).toBe(true);
    expect(search?.required).toBe(true);
  });

  it('has no duplicate package entries', () => {
    const names = TERMINAL_ADDONS.map((a) => a.packageName);
    expect(new Set(names).size).toBe(names.length);
  });

  it('exports the TerminalAddonEntry type usably', () => {
    const sample: TerminalAddonEntry = {
      packageName: '@xterm/addon-test',
      exportName: 'TestAddon',
      loadOrder: 'post-open',
      required: false,
      purpose: 'smoke',
    };
    expect(sample.loadOrder).toBe('post-open');
  });
});
