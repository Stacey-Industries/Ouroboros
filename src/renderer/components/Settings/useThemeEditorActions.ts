import { useCallback } from 'react';

import type { AppConfig } from '../../types/electron';
import {
  type ColorToken,
  restoreThemeColors,
  restoreTokenColor,
} from './ThemeEditor.shared';

type ThemeEditorActionArgs = {
  activeThemeId: string;
  customThemeColors: AppConfig['customThemeColors'];
  onChange: <K extends keyof AppConfig>(key: K, value: AppConfig[K]) => void;
  onSaveAsCustom: () => void;
  overrides: Record<string, string>;
  setOverrides: React.Dispatch<React.SetStateAction<Record<string, string>>>;
};

type ThemeEditorActions = {
  onColorChange: (token: ColorToken, newHex: string) => void;
  onResetAll: () => void;
  onResetToken: (token: ColorToken) => void;
  onSaveAsCustom: () => void;
};

function useThemeChangeActions({
  customThemeColors,
  onChange,
  onSaveAsCustom,
  overrides,
}: {
  customThemeColors: AppConfig['customThemeColors'];
  onChange: <K extends keyof AppConfig>(key: K, value: AppConfig[K]) => void;
  onSaveAsCustom: () => void;
  overrides: Record<string, string>;
}) {
  const onColorChange = useCallback(
    (token: ColorToken, newHex: string): void => {
      onChange('customThemeColors', { ...(customThemeColors ?? {}), [token.cssVar]: newHex });
    },
    [customThemeColors, onChange],
  );
  const handleSaveAsCustom = useCallback((): void => {
    onChange('customThemeColors', { ...overrides });
    onChange('activeTheme', 'custom');
    onSaveAsCustom();
  }, [onChange, onSaveAsCustom, overrides]);

  return { handleSaveAsCustom, onColorChange };
}

function useThemeResetActions({
  activeThemeId,
  customThemeColors,
  onChange,
}: {
  activeThemeId: string;
  customThemeColors: AppConfig['customThemeColors'];
  onChange: <K extends keyof AppConfig>(key: K, value: AppConfig[K]) => void;
}) {
  const onResetToken = useCallback(
    (token: ColorToken): void => {
      const updatedColors = { ...(customThemeColors ?? {}) };
      delete updatedColors[token.cssVar];
      onChange('customThemeColors', updatedColors);
      restoreTokenColor(activeThemeId, token);
    },
    [activeThemeId, customThemeColors, onChange],
  );
  const onResetAll = useCallback((): void => {
    onChange('customThemeColors', {});
    restoreThemeColors(activeThemeId);
  }, [activeThemeId, onChange]);

  return { onResetAll, onResetToken };
}

function useLocalOverrideActions({
  setOverrides,
}: {
  setOverrides: React.Dispatch<React.SetStateAction<Record<string, string>>>;
}) {
  const setOverride = useCallback(
    (token: ColorToken, newHex: string): void => {
      setOverrides((current) => ({ ...current, [token.cssVar]: newHex }));
    },
    [setOverrides],
  );
  const clearOverride = useCallback(
    (token: ColorToken): void => {
      setOverrides((current) => {
        const next = { ...current };
        delete next[token.cssVar];
        return next;
      });
    },
    [setOverrides],
  );
  const clearAllOverrides = useCallback((): void => {
    setOverrides({});
  }, [setOverrides]);

  return { clearAllOverrides, clearOverride, setOverride };
}

function useBoundThemeActions({
  changeActions,
  localOverrideActions,
  resetActions,
}: {
  changeActions: ReturnType<typeof useThemeChangeActions>;
  localOverrideActions: ReturnType<typeof useLocalOverrideActions>;
  resetActions: ReturnType<typeof useThemeResetActions>;
}) {
  const onColorChange = useCallback(
    (token: ColorToken, newHex: string): void => {
      localOverrideActions.setOverride(token, newHex);
      changeActions.onColorChange(token, newHex);
    },
    [changeActions, localOverrideActions],
  );
  const onResetToken = useCallback(
    (token: ColorToken): void => {
      localOverrideActions.clearOverride(token);
      resetActions.onResetToken(token);
    },
    [localOverrideActions, resetActions],
  );
  const onResetAll = useCallback((): void => {
    localOverrideActions.clearAllOverrides();
    resetActions.onResetAll();
  }, [localOverrideActions, resetActions]);

  return { onColorChange, onResetAll, onResetToken };
}

export function useThemeEditorActions({
  activeThemeId,
  customThemeColors,
  onChange,
  onSaveAsCustom,
  overrides,
  setOverrides,
}: ThemeEditorActionArgs): ThemeEditorActions {
  const changeActions = useThemeChangeActions({
    customThemeColors,
    onChange,
    onSaveAsCustom,
    overrides,
  });
  const resetActions = useThemeResetActions({
    activeThemeId,
    customThemeColors,
    onChange,
  });
  const localOverrideActions = useLocalOverrideActions({ setOverrides });
  const { onColorChange, onResetAll, onResetToken } = useBoundThemeActions({
    changeActions,
    localOverrideActions,
    resetActions,
  });

  return {
    onColorChange,
    onResetAll,
    onResetToken,
    onSaveAsCustom: changeActions.handleSaveAsCustom,
  };
}
