/**
 * SettingsTabContent.tsx — Renders the active settings tab's section.
 */

import React from 'react';
import type { AppConfig } from '../../types/electron';
import type { TabId } from './settingsTabs';
import { GeneralSection } from './GeneralSection';
import { AppearanceSection } from './AppearanceSection';
import { TerminalSection } from './TerminalSection';
import { HooksSection } from './HooksSection';
import { FontSection } from './FontSection';
import { KeybindingsSection } from './KeybindingsSection';
import { ProfilesSection } from './ProfilesSection';
import { FileFilterSection } from './FileFilterSection';
import { ExtensionsSection } from './ExtensionsSection';
import { ClaudeSection } from './ClaudeSection';
import { McpSection } from './McpSection';
import { CodeModeSection } from './CodeModeSection';

interface SettingsTabContentProps {
  activeTab: TabId;
  draft: AppConfig;
  onChange: <K extends keyof AppConfig>(key: K, value: AppConfig[K]) => void;
  onImport: (imported: AppConfig) => void;
  onPreviewTheme: (themeId: string) => void;
}

export function SettingsTabContent({
  activeTab,
  draft,
  onChange,
  onImport,
  onPreviewTheme,
}: SettingsTabContentProps): React.ReactElement {
  switch (activeTab) {
    case 'general':
      return <GeneralSection draft={draft} onChange={onChange} onImport={onImport} />;
    case 'appearance':
      return <AppearanceSection draft={draft} onChange={onChange} onPreviewTheme={onPreviewTheme} />;
    case 'fonts':
      return <FontSection draft={draft} onChange={onChange} />;
    case 'terminal':
      return <TerminalSection draft={draft} onChange={onChange} />;
    case 'claude':
      return <ClaudeSection draft={draft} onChange={onChange} />;
    case 'keybindings':
      return <KeybindingsSection draft={draft} onChange={onChange} />;
    case 'hooks':
      return <HooksSection draft={draft} onChange={onChange} />;
    case 'profiles':
      return <ProfilesSection draft={draft} onChange={onChange} />;
    case 'files':
      return <FileFilterSection draft={draft} onChange={onChange} />;
    case 'extensions':
      return <ExtensionsSection />;
    case 'mcp':
      return <McpSection />;
    case 'codemode':
      return <CodeModeSection />;
  }
}
