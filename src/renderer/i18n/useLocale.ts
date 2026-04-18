/**
 * useLocale.ts — Config-driven locale hook.
 * Wave 38 Phase A: reads config.platform.language, falls back to
 * navigator.language (first-two chars), then 'en'.
 */
import { useCallback, useEffect, useState } from 'react';

import { useConfig } from '../hooks/useConfig';
import { getLocale, LocaleCode, setLocale, t } from './index';

export interface UseLocaleReturn {
  language: LocaleCode;
  setLanguage: (code: LocaleCode) => void;
  t: typeof t;
}

const SUPPORTED: LocaleCode[] = ['en', 'es'];

function detectNavigatorLocale(): LocaleCode {
  const nav = typeof navigator !== 'undefined' ? navigator.language : '';
  const prefix = nav.slice(0, 2) as LocaleCode;
  return SUPPORTED.includes(prefix) ? prefix : 'en';
}

function resolveInitialLocale(configured: LocaleCode | undefined): LocaleCode {
  if (configured && SUPPORTED.includes(configured)) return configured;
  return detectNavigatorLocale();
}

/**
 * useLocale — returns the current locale + a setter that persists to config.
 *
 * Consumers re-render whenever config.platform.language changes because
 * useConfig subscribes to external config changes.
 */
export function useLocale(): UseLocaleReturn {
  const { config, set } = useConfig();

  const configured = config?.platform?.language;
  const initial = resolveInitialLocale(configured);
  const [language, setLanguageState] = useState<LocaleCode>(initial);

  // Sync runtime locale whenever the config value changes.
  useEffect(() => {
    const next = resolveInitialLocale(configured);
    setLocale(next);
    setLanguageState(next);
  }, [configured]);

  const setLanguage = useCallback(
    (code: LocaleCode) => {
      setLocale(code);
      setLanguageState(code);
      const current = config?.platform ?? {};
      void set('platform', { ...current, language: code });
    },
    [config, set],
  );

  // Ensure module-level locale is in sync on first render.
  useEffect(() => {
    if (getLocale() !== language) setLocale(language);
  }, [language]);

  return { language, setLanguage, t };
}
