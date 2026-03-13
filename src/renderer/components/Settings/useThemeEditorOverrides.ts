import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { applyCustomThemeColors } from '../../hooks/useTheme';
import type { AppConfig } from '../../types/electron';
import {
  buildAppliedColors,
  fallbackHex,
  getBaseTheme,
  readSavedColors,
  type ColorToken,
} from './ThemeEditor.shared';

export function useThemeEditorOverrides(
  activeThemeId: string,
  customThemeColors: AppConfig['customThemeColors'],
): {
  getEffectiveColor: (token: ColorToken) => string;
  isOverridden: (token: ColorToken) => boolean;
  overrides: Record<string, string>;
  setOverrides: React.Dispatch<React.SetStateAction<Record<string, string>>>;
} {
  const baseTheme = useMemo(() => getBaseTheme(activeThemeId), [activeThemeId]);
  const [overrides, setOverrides] = useState<Record<string, string>>(() =>
    readSavedColors(customThemeColors),
  );
  const previousThemeIdRef = useRef(activeThemeId);

  useEffect(() => {
    const colorMap = buildAppliedColors(overrides);
    if (Object.keys(colorMap).length > 0) {
      applyCustomThemeColors(colorMap);
    }
  }, [overrides]);

  useEffect(() => {
    if (previousThemeIdRef.current !== activeThemeId) {
      previousThemeIdRef.current = activeThemeId;
      setOverrides(activeThemeId === 'custom' ? readSavedColors(customThemeColors) : {});
    }
  }, [activeThemeId, customThemeColors]);

  const getEffectiveColor = useCallback(
    (token: ColorToken): string => overrides[token.cssVar] ?? baseTheme.colors[token.colorKey] ?? fallbackHex,
    [baseTheme, overrides],
  );
  const isOverridden = useCallback((token: ColorToken): boolean => token.cssVar in overrides, [overrides]);

  return { getEffectiveColor, isOverridden, overrides, setOverrides };
}
