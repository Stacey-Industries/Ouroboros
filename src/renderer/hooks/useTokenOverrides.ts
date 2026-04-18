/**
 * useTokenOverrides — applies theming config overrides as CSS custom properties
 * on document.documentElement AFTER useThemeRuntimeBootstrap runs.
 *
 * Call order in App.tsx: useThemeRuntimeBootstrap → useTokenOverrides.
 * Overrides win over theme defaults. Tracked in a ref so stale keys are removed.
 */

import { useEffect, useRef } from 'react';

import { useConfig } from './useConfig';

/** CSS properties currently set by this hook (name → value). */
type AppliedMap = Map<string, string>;

function applyProperty(name: string, value: string, applied: AppliedMap): void {
  document.documentElement.style.setProperty(name, value);
  applied.set(name, value);
}

function removeStaleProperties(next: AppliedMap, prev: AppliedMap): void {
  for (const key of prev.keys()) {
    if (!next.has(key)) {
      document.documentElement.style.removeProperty(key);
    }
  }
}

type ThemingSlice = NonNullable<ReturnType<typeof useConfig>['config']>['theming'];
type FontsSlice = { editor?: string; chat?: string; terminal?: string } | undefined;

function applyFontOverrides(fonts: FontsSlice, map: AppliedMap): void {
  if (!fonts) return;
  if (fonts.editor) map.set('--font-editor', fonts.editor);
  if (fonts.chat) map.set('--font-chat', fonts.chat);
  if (fonts.terminal) map.set('--font-terminal', fonts.terminal);
}

function buildOverrideMap(theming: ThemingSlice): AppliedMap {
  const map: AppliedMap = new Map();
  if (!theming) return map;

  if (theming.accentOverride) map.set('--interactive-accent', theming.accentOverride);
  applyFontOverrides(theming.fonts, map);
  if (theming.customTokens) {
    for (const [name, value] of Object.entries(theming.customTokens)) {
      map.set(name, value);
    }
  }
  return map;
}

export function useTokenOverrides(): void {
  const { config } = useConfig();
  const appliedRef = useRef<AppliedMap>(new Map());

  useEffect(() => {
    const next = buildOverrideMap(config?.theming);
    const prev = appliedRef.current;

    removeStaleProperties(next, prev);
    for (const [name, value] of next.entries()) {
      applyProperty(name, value, next);
    }
    appliedRef.current = next;
  }, [config?.theming]);

  // Cleanup: remove all applied properties on unmount
  useEffect(() => {
    return () => {
      for (const key of appliedRef.current.keys()) {
        document.documentElement.style.removeProperty(key);
      }
      appliedRef.current = new Map();
    };
  }, []);
}
