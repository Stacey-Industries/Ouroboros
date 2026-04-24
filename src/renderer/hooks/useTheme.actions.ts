import { useCallback } from 'react';

import { defaultThemeId, themes } from '../themes';
import { DEFAULT_MATERIAL_VARIANT, type MaterialVariant } from '../themes/material';
import type { AppTheme } from '../types/electron';

interface ThemeActionDeps {
  setRuntimeState: (partial: Partial<ThemeActionRuntimePatch>) => void;
  writeThemeToStore: (id: AppTheme) => Promise<void>;
}

interface ThemeActionRuntimePatch {
  themeId: string;
  showBgGradient: boolean;
  glassOpacity: number;
  materialVariant: MaterialVariant;
  hydrated: boolean;
}

export interface ThemeActions {
  setTheme: (id: string) => Promise<void>;
  setShowBgGradient: (value: boolean) => void;
  setGlassOpacity: (value: number) => void;
  setMaterialVariant: (value: MaterialVariant) => void;
}

function isValidThemeId(id: string): boolean {
  return id in themes || id.startsWith('ext:');
}

function normalizeMaterialVariant(value: unknown): MaterialVariant {
  return value === 'vapor' || value === 'prism' || value === 'warp'
    ? value
    : DEFAULT_MATERIAL_VARIANT;
}

function persistConfig(key: string, value: unknown): void {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window.electronAPI?.config?.set as any)?.(key, value);
  } catch {
    /* ignore — IPC not available */
  }
}

export function useThemeActions(deps: ThemeActionDeps): ThemeActions {
  const { setRuntimeState, writeThemeToStore } = deps;

  const setTheme = useCallback(
    async (id: string) => {
      const resolved = (isValidThemeId(id) ? id : defaultThemeId) as AppTheme;
      setRuntimeState({ themeId: resolved, hydrated: true });
      await writeThemeToStore(resolved);
    },
    [setRuntimeState, writeThemeToStore],
  );

  const setShowBgGradient = useCallback(
    (value: boolean) => {
      setRuntimeState({ showBgGradient: value, hydrated: true });
      persistConfig('showBgGradient', value);
    },
    [setRuntimeState],
  );

  const setGlassOpacity = useCallback(
    (value: number) => {
      setRuntimeState({ glassOpacity: value, hydrated: true });
      persistConfig('glassOpacity', value);
    },
    [setRuntimeState],
  );

  const setMaterialVariant = useCallback(
    (value: MaterialVariant) => {
      const normalized = normalizeMaterialVariant(value);
      setRuntimeState({ materialVariant: normalized, hydrated: true });
      persistConfig('materialVariant', normalized);
    },
    [setRuntimeState],
  );

  return { setTheme, setShowBgGradient, setGlassOpacity, setMaterialVariant };
}
