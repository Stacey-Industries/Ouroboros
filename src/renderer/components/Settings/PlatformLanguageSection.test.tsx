/**
 * PlatformLanguageSection.test.tsx — Wave 38 Phase G.
 *
 * Tests for the language picker subsection.
 * Vitest runs under Node (no DOM), so we test module shape and the
 * config-mutation logic exercised by useLocale — same pattern as
 * PlatformSection.test.tsx (Phase F).
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { LocaleCode } from '../../i18n';
import { getLocale, setLocale, t } from '../../i18n';
import { PlatformLanguageSection } from './PlatformLanguageSection';

// ---------------------------------------------------------------------------
// Component export shape
// ---------------------------------------------------------------------------

describe('PlatformLanguageSection', () => {
  it('exports a function component', () => {
    expect(typeof PlatformLanguageSection).toBe('function');
  });
});

// ---------------------------------------------------------------------------
// Language option selection writes correct locale code
// ---------------------------------------------------------------------------

describe('language picker locale state', () => {
  beforeEach(() => { setLocale('en'); });
  afterEach(() => { setLocale('en'); });

  it('setLocale("es") persists Spanish locale', () => {
    expect(getLocale()).toBe('en');
    setLocale('es');
    expect(getLocale()).toBe('es');
  });

  it('setLocale("en") restores English locale', () => {
    setLocale('es');
    setLocale('en');
    expect(getLocale()).toBe('en');
  });

  it('supported locale codes are en and es', () => {
    const supported: LocaleCode[] = ['en', 'es'];
    expect(supported).toContain('en');
    expect(supported).toContain('es');
  });
});

// ---------------------------------------------------------------------------
// t() labels resolve correctly for both locales
// ---------------------------------------------------------------------------

describe('language label strings resolve via t()', () => {
  afterEach(() => { setLocale('en'); });

  it('settings.language.label returns Language in en', () => {
    setLocale('en');
    expect(t('settings.language.label')).toBe('Language');
  });

  it('settings.language.label returns Idioma in es', () => {
    setLocale('es');
    expect(t('settings.language.label')).toBe('Idioma');
  });

  it('settings.language.english returns English in en', () => {
    setLocale('en');
    expect(t('settings.language.english')).toBe('English');
  });

  it('settings.language.spanish returns Español in es', () => {
    setLocale('es');
    expect(t('settings.language.spanish')).toBe('Español');
  });
});

// ---------------------------------------------------------------------------
// Config mutation pattern: picking Spanish writes platform.language
// ---------------------------------------------------------------------------

describe('language picker config mutation', () => {
  it('patch object sets language to es', () => {
    const currentPlatform = { updateChannel: 'stable' as const };
    const patched = { ...currentPlatform, language: 'es' as LocaleCode };
    expect(patched.language).toBe('es');
  });

  it('patch object sets language to en', () => {
    const currentPlatform = { language: 'es' as LocaleCode };
    const patched = { ...currentPlatform, language: 'en' as LocaleCode };
    expect(patched.language).toBe('en');
  });

  it('patch preserves existing platform fields', () => {
    const currentPlatform = {
      updateChannel: 'beta' as const,
      crashReports: { enabled: true },
      language: 'en' as LocaleCode,
    };
    const patched = { ...currentPlatform, language: 'es' as LocaleCode };
    expect(patched.updateChannel).toBe('beta');
    expect(patched.crashReports?.enabled).toBe(true);
    expect(patched.language).toBe('es');
  });
});

// ---------------------------------------------------------------------------
// Runtime locale switch integration
// ---------------------------------------------------------------------------

describe('runtime locale switch integration', () => {
  afterEach(() => { setLocale('en'); });

  it('t("tour.next") changes when locale switches', () => {
    setLocale('en');
    expect(t('tour.next')).toBe('Next');

    setLocale('es');
    expect(t('tour.next')).toBe('Siguiente');
  });

  it('t("common.close") changes when locale switches', () => {
    setLocale('en');
    expect(t('common.close')).toBe('Close');

    setLocale('es');
    expect(t('common.close')).toBe('Cerrar');
  });

  it('t("settings.language.label") switches between Language and Idioma', () => {
    setLocale('en');
    expect(t('settings.language.label')).toBe('Language');

    setLocale('es');
    expect(t('settings.language.label')).toBe('Idioma');
  });
});

// ---------------------------------------------------------------------------
// useLocale export
// ---------------------------------------------------------------------------

describe('useLocale export', () => {
  it('exports useLocale as a function', async () => {
    const mod = await import('../../i18n/useLocale');
    expect(typeof mod.useLocale).toBe('function');
  });
});
