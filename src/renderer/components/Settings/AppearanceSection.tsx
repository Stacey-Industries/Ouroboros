import React, { useState } from 'react';

import { useExtensionThemes } from '../../hooks/useExtensionThemes';
import { customTheme, type Theme, themeList } from '../../themes';
import { getMaterialVariant } from '../../themes/material';
import type { AppConfig, AppTheme } from '../../types/electron';
import { AppearanceSectionContent } from './AppearanceSectionParts';

// Wave 45 — "None" is a first-class theme choice. The material variant's
// baseline palette is used directly; no overlay applied.
function buildNoneCard(variant: AppConfig['materialVariant']): Theme {
  const palette = getMaterialVariant(variant ?? 'vapor').palette;
  return {
    id: 'none',
    name: 'None',
    fontFamily: {
      mono: '"Geist Mono", "JetBrains Mono", monospace',
      ui: '"Inter", system-ui, -apple-system, sans-serif',
    },
    colors: palette,
  };
}

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
  const hasCustomColors = Boolean(
    draft.customThemeColors && Object.keys(draft.customThemeColors).length > 0,
  );
  const displayedThemes = [
    buildNoneCard(draft.materialVariant),
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
