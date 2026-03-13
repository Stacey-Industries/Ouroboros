/**
 * SettingsTabContent.tsx - Renders the active settings tab's section.
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

type SharedTabProps = Omit<SettingsTabContentProps, 'activeTab'>;
type TabRenderer = (props: SharedTabProps) => React.ReactElement;

const TAB_RENDERERS: Record<TabId, TabRenderer> = {
  general: ({ draft, onChange, onImport }) => <GeneralSection draft={draft} onChange={onChange} onImport={onImport} />,
  appearance: ({ draft, onChange, onPreviewTheme }) => <AppearanceSection draft={draft} onChange={onChange} onPreviewTheme={onPreviewTheme} />,
  fonts: ({ draft, onChange }) => <FontSection draft={draft} onChange={onChange} />,
  terminal: ({ draft, onChange }) => <TerminalSection draft={draft} onChange={onChange} />,
  claude: ({ draft, onChange }) => <ClaudeSection draft={draft} onChange={onChange} />,
  keybindings: ({ draft, onChange }) => <KeybindingsSection draft={draft} onChange={onChange} />,
  hooks: ({ draft, onChange }) => <HooksSection draft={draft} onChange={onChange} />,
  profiles: ({ draft, onChange }) => <ProfilesSection draft={draft} onChange={onChange} />,
  files: ({ draft, onChange }) => <FileFilterSection draft={draft} onChange={onChange} />,
  extensions: () => <ExtensionsSection />,
  mcp: () => <McpSection />,
  codemode: () => <CodeModeSection />,
};

export function SettingsTabContent({ activeTab, ...sharedProps }: SettingsTabContentProps): React.ReactElement {
  return TAB_RENDERERS[activeTab](sharedProps);
}
