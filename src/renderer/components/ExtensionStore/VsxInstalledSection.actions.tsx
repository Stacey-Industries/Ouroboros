import React from 'react';

import type { Theme } from '../../themes';
import type { ExtensionIconThemeData, ExtensionProductIconThemeData } from '../../types/electron';
import { smallButtonStyle } from '../Settings/settingsStyles';
import { themeActionsStyle } from './vsxInstalledSectionStyles';

interface ThemeOption {
  id: string;
  label: string;
}

interface VsxActionGroupProps {
  activeThemeId: string;
  activeVerb?: string;
  onApplyTheme: (themeId: string) => Promise<void>;
  options: ThemeOption[];
  themeKind: string;
  verb?: string;
}

export function ThemeActionCollections({
  activeFileIconThemeId,
  activeProductIconThemeId,
  activeThemeId,
  extensionThemes,
  fileIconThemes,
  onApplyFileIconTheme,
  onApplyProductIconTheme,
  onApplyTheme,
  productIconThemes,
}: {
  activeFileIconThemeId: string;
  activeProductIconThemeId: string;
  activeThemeId: string;
  extensionThemes: Theme[];
  fileIconThemes: ExtensionIconThemeData[];
  onApplyFileIconTheme: (themeId: string) => Promise<void>;
  onApplyProductIconTheme: (themeId: string) => Promise<void>;
  onApplyTheme: (themeId: string) => Promise<void>;
  productIconThemes: ExtensionProductIconThemeData[];
}): React.ReactElement {
  return (
    <>
      <ThemeContributionActions activeThemeId={activeThemeId} themes={extensionThemes} onApplyTheme={onApplyTheme} />
      <FileIconContributionActions
        activeThemeId={activeFileIconThemeId}
        themes={fileIconThemes}
        onApplyTheme={onApplyFileIconTheme}
      />
      <ProductIconContributionActions
        activeThemeId={activeProductIconThemeId}
        themes={productIconThemes}
        onApplyTheme={onApplyProductIconTheme}
      />
    </>
  );
}

function ThemeContributionActions({
  activeThemeId,
  themes,
  onApplyTheme,
}: {
  activeThemeId: string;
  themes: Theme[];
  onApplyTheme: (themeId: string) => Promise<void>;
}): React.ReactElement | null {
  if (themes.length === 0) return null;
  return (
    <VsxActionGroup
      activeThemeId={activeThemeId}
      onApplyTheme={onApplyTheme}
      options={themes.map((theme) => ({ id: theme.id, label: theme.name }))}
      themeKind="Theme"
      verb="Apply"
    />
  );
}

function FileIconContributionActions({
  activeThemeId,
  themes,
  onApplyTheme,
}: {
  activeThemeId: string;
  themes: ExtensionIconThemeData[];
  onApplyTheme: (themeId: string) => Promise<void>;
}): React.ReactElement | null {
  if (themes.length === 0) return null;
  return (
    <VsxActionGroup
      activeThemeId={activeThemeId}
      onApplyTheme={onApplyTheme}
      options={themes.map((theme) => ({ id: theme.id, label: theme.label }))}
      themeKind="File icon theme"
    />
  );
}

function ProductIconContributionActions({
  activeThemeId,
  themes,
  onApplyTheme,
}: {
  activeThemeId: string;
  themes: ExtensionProductIconThemeData[];
  onApplyTheme: (themeId: string) => Promise<void>;
}): React.ReactElement | null {
  if (themes.length === 0) return null;
  return (
    <VsxActionGroup
      activeThemeId={activeThemeId}
      activeVerb="Using"
      onApplyTheme={onApplyTheme}
      options={themes.map((theme) => ({ id: theme.id, label: theme.label }))}
      themeKind="Product icon theme"
    />
  );
}

function VsxActionGroup({
  activeThemeId,
  activeVerb = 'Using',
  onApplyTheme,
  options,
  themeKind,
  verb = 'Use',
}: VsxActionGroupProps): React.ReactElement {
  return (
    <div style={themeActionsStyle}>
      {options.map((option) => {
        const isActive = option.id === activeThemeId;
        const title = isActive ? `${themeKind} already active` : `${verb} ${option.label}`;
        const label = isActive ? `${activeVerb} ${option.label}` : `${verb} ${option.label}`;
        return (
          <button
            key={option.id}
            onClick={() => void onApplyTheme(option.id)}
            title={title}
            style={smallButtonStyle}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
