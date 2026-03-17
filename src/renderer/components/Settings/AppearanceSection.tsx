import React, { useState } from 'react';
import { customTheme, themeList } from '../../themes';
import type { AppConfig, AppTheme } from '../../types/electron';
import { useExtensionThemes } from '../../hooks/useExtensionThemes';
import { AppearanceSectionContent } from './AppearanceSectionParts';

interface AppearanceSectionProps {
  draft: AppConfig;
  onChange: <K extends keyof AppConfig>(key: K, value: AppConfig[K]) => void;
  onPreviewTheme: (themeId: string) => void;
}

export function AppearanceSection({
  draft,
  onChange,
  onPreviewTheme,
}: AppearanceSectionProps): React.ReactElement {
  const [editorOpen, setEditorOpen] = useState(false);
  const extensionThemes = useExtensionThemes();
  const hasCustomColors = Boolean(draft.customThemeColors && Object.keys(draft.customThemeColors).length > 0);
  const displayedThemes = [
    ...themeList,
    ...extensionThemes,
    ...(hasCustomColors ? [customTheme] : []),
  ];

  function handleThemeClick(themeId: string): void {
    onChange('activeTheme', themeId as AppTheme);
    onPreviewTheme(themeId);
  }

  function handleSaveAsCustom(): void {
    onChange('activeTheme', 'custom');
    onPreviewTheme('custom');
  }

  return (
    <AppearanceSectionContent
      draft={draft}
      displayedThemes={displayedThemes}
      editorOpen={editorOpen}
      onChange={onChange}
      onSaveAsCustom={handleSaveAsCustom}
      onThemeClick={handleThemeClick}
      setEditorOpen={setEditorOpen}
    />
  );
}
