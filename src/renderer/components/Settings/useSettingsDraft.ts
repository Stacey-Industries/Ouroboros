/**
 * useSettingsDraft.ts — Shared draft/save logic for SettingsModal and SettingsPanel.
 */

import { useCallback, useRef, useState } from 'react';
import type { AppConfig } from '../../types/electron';
import { useConfig } from '../../hooks/useConfig';
import { useTheme, applyFontConfig } from '../../hooks/useTheme';

export interface SettingsDraftApi {
  draft: AppConfig | null;
  setDraft: React.Dispatch<React.SetStateAction<AppConfig | null>>;
  handleChange: <K extends keyof AppConfig>(key: K, value: AppConfig[K]) => void;
  handleImport: (imported: AppConfig) => void;
  handlePreviewTheme: (themeId: string) => void;
  handleCancel: (onClose: () => void) => void;
  handleSave: (onClose: () => void) => Promise<void>;
  isSaving: boolean;
  saveError: string | null;
  originalThemeRef: React.MutableRefObject<string | null>;
  originalGradientRef: React.MutableRefObject<boolean>;
}

export function useSettingsDraft(): SettingsDraftApi {
  const { set } = useConfig();
  const { setTheme, setShowBgGradient } = useTheme();

  const [draft, setDraft] = useState<AppConfig | null>(null);
  const originalThemeRef = useRef<string | null>(null);
  const originalGradientRef = useRef<boolean>(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const handleChange = useCallback(
    <K extends keyof AppConfig>(key: K, value: AppConfig[K]): void => {
      setDraft((prev) => (prev ? { ...prev, [key]: value } : prev));
      if (key === 'showBgGradient') {
        setShowBgGradient(value as boolean);
      }
    },
    [setShowBgGradient],
  );

  const handleImport = useCallback((imported: AppConfig): void => {
    setDraft({ ...imported });
  }, []);

  const handlePreviewTheme = useCallback(
    (themeId: string): void => {
      void setTheme(themeId);
    },
    [setTheme],
  );

  function handleCancel(onClose: () => void): void {
    if (originalThemeRef.current) {
      void setTheme(originalThemeRef.current);
    }
    setShowBgGradient(originalGradientRef.current);
    onClose();
  }

  async function handleSave(onClose: () => void): Promise<void> {
    if (!draft) return;
    setIsSaving(true);
    setSaveError(null);

    try {
      await persistDraft(draft, set);
      await applyThemeAndFont(draft, setTheme, setShowBgGradient);
      originalThemeRef.current = draft.activeTheme ?? null;
      originalGradientRef.current = draft.showBgGradient ?? true;
      onClose();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save settings.');
    } finally {
      setIsSaving(false);
    }
  }

  return {
    draft, setDraft,
    handleChange, handleImport, handlePreviewTheme,
    handleCancel, handleSave,
    isSaving, saveError,
    originalThemeRef, originalGradientRef,
  };
}

async function persistDraft(
  draft: AppConfig,
  set: <K extends keyof AppConfig>(key: K, value: AppConfig[K]) => Promise<void>,
): Promise<void> {
  const keys = Object.keys(draft) as (keyof AppConfig)[];
  await Promise.all(
    keys.map((key) => set(key, draft[key] as AppConfig[typeof key])),
  );
}

async function applyThemeAndFont(
  draft: AppConfig,
  setTheme: (id: string) => Promise<void>,
  setShowBgGradient: (v: boolean) => void,
): Promise<void> {
  if (draft.activeTheme) await setTheme(draft.activeTheme);
  setShowBgGradient(draft.showBgGradient ?? true);
  applyFontConfig(draft.fontUI ?? '', draft.fontMono ?? '', draft.fontSizeUI ?? 13);
}
