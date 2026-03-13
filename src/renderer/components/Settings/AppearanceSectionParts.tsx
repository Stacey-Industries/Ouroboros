import React from 'react';
import type { Theme } from '../../themes';
import type { AppConfig } from '../../types/electron';
import {
  BackgroundGradientSection,
  CustomCSSSection,
  ThemeEditorSection,
  ThemeGrid,
} from './AppearanceSectionParts.sections';

interface AppearanceSectionContentProps {
  draft: AppConfig;
  displayedThemes: Theme[];
  editorOpen: boolean;
  onChange: <K extends keyof AppConfig>(key: K, value: AppConfig[K]) => void;
  onSaveAsCustom: () => void;
  onThemeClick: (themeId: string) => void;
  setEditorOpen: React.Dispatch<React.SetStateAction<boolean>>;
}

const containerStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '24px',
};

export function AppearanceSectionContent({
  draft,
  displayedThemes,
  editorOpen,
  onChange,
  onSaveAsCustom,
  onThemeClick,
  setEditorOpen,
}: AppearanceSectionContentProps): React.ReactElement {
  return (
    <div style={containerStyle}>
      <ThemeGrid
        activeTheme={draft.activeTheme}
        displayedThemes={displayedThemes}
        onThemeClick={onThemeClick}
      />
      <BackgroundGradientSection
        checked={draft.showBgGradient ?? true}
        onChange={(value) => onChange('showBgGradient', value)}
      />
      <ThemeEditorSection
        activeThemeId={draft.activeTheme}
        draft={draft}
        editorOpen={editorOpen}
        onChange={onChange}
        onSaveAsCustom={onSaveAsCustom}
        setEditorOpen={setEditorOpen}
      />
      <CustomCSSSection draft={draft} onChange={onChange} />
    </div>
  );
}
