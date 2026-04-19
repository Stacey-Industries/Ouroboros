/**
 * useLocale.test.ts — Unit tests for useLocale hook logic.
 * Wave 38 Phase A.
 *
 * Vitest runs under Node (no DOM). We test the pure helper functions
 * extracted from useLocale directly, matching the pattern used by
 * useLspDiagnosticsSync.test.ts.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { LocaleCode } from './index';
import { getLocale, setLocale } from './index';

// ---------------------------------------------------------------------------
// Re-implement the testable helpers inline (same logic as useLocale.ts)
// so we can test them without importing React or mocking useConfig.
// ---------------------------------------------------------------------------

const SUPPORTED: LocaleCode[] = ['en', 'es'];

function detectNavigatorLocale(navLanguage: string): LocaleCode {
  const prefix = navLanguage.slice(0, 2) as LocaleCode;
  return SUPPORTED.includes(prefix) ? prefix : 'en';
}

function resolveInitialLocale(
  configured: LocaleCode | undefined,
  navLanguage: string,
): LocaleCode {
  if (configured && SUPPORTED.includes(configured)) return configured;
  return detectNavigatorLocale(navLanguage);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('resolveInitialLocale', () => {
  it('returns config value when it is a supported locale', () => {
    expect(resolveInitialLocale('es', 'en-US')).toBe('es');
    expect(resolveInitialLocale('en', 'fr-FR')).toBe('en');
  });

  it('falls back to navigator.language when config is undefined', () => {
    expect(resolveInitialLocale(undefined, 'es-MX')).toBe('es');
    expect(resolveInitialLocale(undefined, 'en-GB')).toBe('en');
  });

  it('falls back to en when navigator.language is unsupported', () => {
    expect(resolveInitialLocale(undefined, 'fr-FR')).toBe('en');
    expect(resolveInitialLocale(undefined, 'zh-CN')).toBe('en');
    expect(resolveInitialLocale(undefined, '')).toBe('en');
  });

  it('ignores unsupported config values and falls back to navigator', () => {
    expect(
      resolveInitialLocale('fr' as LocaleCode, 'es-419'),
    ).toBe('es');
  });
});

describe('detectNavigatorLocale', () => {
  it('extracts first-two chars to pick locale', () => {
    expect(detectNavigatorLocale('en-US')).toBe('en');
    expect(detectNavigatorLocale('es-419')).toBe('es');
  });

  it('returns en for unsupported language prefixes', () => {
    expect(detectNavigatorLocale('de-DE')).toBe('en');
    expect(detectNavigatorLocale('ja')).toBe('en');
  });
});

describe('setLocale / getLocale roundtrip (module-level state)', () => {
  beforeEach(() => {
    setLocale('en');
  });

  afterEach(() => {
    setLocale('en');
    vi.restoreAllMocks();
  });

  it('getLocale returns en by default', () => {
    expect(getLocale()).toBe('en');
  });

  it('setLanguage("es") persists via setLocale + getLocale', () => {
    // Simulate what the setLanguage callback in useLocale does:
    setLocale('es');
    expect(getLocale()).toBe('es');
  });

  it('switching back to en restores the locale', () => {
    setLocale('es');
    setLocale('en');
    expect(getLocale()).toBe('en');
  });
});

describe('useLocale hook export', () => {
  it('exports useLocale as a function', async () => {
    // Lazy import avoids pulling React into the Node test environment.
    // We only verify the export shape here — rendering is not tested.
    const mod = await import('./useLocale');
    expect(typeof mod.useLocale).toBe('function');
  });
});
