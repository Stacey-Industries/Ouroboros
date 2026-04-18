import React, { useCallback } from 'react';

import { useTheme } from '../../hooks/useTheme';
import type { Theme } from '../../themes';
import type { AppConfig } from '../../types/electron';
import {
  AccentPicker,
  AppearanceSectionVsCodeImport,
  BackgroundGradientSection,
  CustomCSSSection,
  GlassOpacitySection,
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
      <GlassOpacitySlider draft={draft} onChange={onChange} />
      <AccentPicker />
      <ThemeEditorSection
        activeThemeId={draft.activeTheme}
        draft={draft}
        editorOpen={editorOpen}
        onChange={onChange}
        onSaveAsCustom={onSaveAsCustom}
        setEditorOpen={setEditorOpen}
      />
      <AppearanceSectionVsCodeImport />
      <CustomCSSSection draft={draft} onChange={onChange} />
    </div>
  );
}

function GlassOpacitySlider({ draft, onChange }: {
  draft: AppConfig;
  onChange: <K extends keyof AppConfig>(key: K, value: AppConfig[K]) => void;
}): React.ReactElement {
  const { setGlassOpacity } = useTheme();
  const handleChange = useCallback((value: number) => {
    onChange('glassOpacity', value);
    setGlassOpacity(value);
  }, [onChange, setGlassOpacity]);

  return (
    <GlassOpacitySection
      value={draft.glassOpacity ?? 0}
      onChange={handleChange}
    />
  );
}
