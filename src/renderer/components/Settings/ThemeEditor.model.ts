import type { AppConfig } from '../../types/electron';
import type { ColorToken } from './ThemeEditor.shared';
import { COLOR_TOKENS } from './ThemeEditor.shared';
import { useThemeEditorActions } from './useThemeEditorActions';
import { useThemeEditorOverrides } from './useThemeEditorOverrides';

export interface ThemeEditorInput {
  activeThemeId: string;
  draft: AppConfig;
  onChange: <K extends keyof AppConfig>(key: K, value: AppConfig[K]) => void;
  onSaveAsCustom: () => void;
}

export interface ThemeEditorModel {
  getEffectiveColor: (token: ColorToken) => string;
  hasOverrides: boolean;
  isOverridden: (token: ColorToken) => boolean;
  onColorChange: (token: ColorToken, newHex: string) => void;
  onResetAll: () => void;
  onResetToken: (token: ColorToken) => void;
  onSaveAsCustom: () => void;
  tokens: ColorToken[];
}

export type { ColorToken } from './ThemeEditor.shared';
export { cssColorToHex } from './ThemeEditor.shared';

export function useThemeEditorModel({
  activeThemeId,
  draft,
  onChange,
  onSaveAsCustom,
}: ThemeEditorInput): ThemeEditorModel {
  const { getEffectiveColor, isOverridden, overrides, setOverrides } =
    useThemeEditorOverrides(activeThemeId, draft.customThemeColors);
  const actions = useThemeEditorActions({
    activeThemeId,
    customThemeColors: draft.customThemeColors,
    onChange,
    onSaveAsCustom,
    overrides,
    setOverrides,
  });

  return {
    getEffectiveColor,
    hasOverrides: Object.keys(overrides).length > 0,
    isOverridden,
    ...actions,
    tokens: COLOR_TOKENS,
  };
}
