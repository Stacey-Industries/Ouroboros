/**
 * SettingsTabContent.tsx - Renders the active settings tab's section.
 */

import React from 'react';

import type { AppConfig } from '../../types/electron';
import { AccountsSection } from './AccountsSection';
import { AgentSection } from './AgentSection';
import { AppearanceSection } from './AppearanceSection';
import { ClaudeSection } from './ClaudeSection';
import { CodeModeSection } from './CodeModeSection';
import { CodexSection } from './CodexSection';
import { ContextDocsSection } from './ContextDocsSection';
import { FileFilterSection } from './FileFilterSection';
import { FontSection } from './FontSection';
import { GeneralSection } from './GeneralSection';
import { HooksSection } from './HooksSection';
import { IntegrationsSection } from './IntegrationsSection';
import { KeybindingsSection } from './KeybindingsSection';
import { ProfilesSection } from './ProfilesSection';
import { ProvidersSection } from './ProvidersSection';
import { SettingsPerformancePanel } from './SettingsPerformancePanel';
import type { TabId } from './settingsTabs';
import { TerminalSection } from './TerminalSection';

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
  accounts: () => <AccountsSection />,
  general: ({ draft, onChange, onImport }) => (
    <GeneralSection draft={draft} onChange={onChange} onImport={onImport} />
  ),
  appearance: ({ draft, onChange, onPreviewTheme }) => (
    <AppearanceSection draft={draft} onChange={onChange} onPreviewTheme={onPreviewTheme} />
  ),
  fonts: ({ draft, onChange }) => <FontSection draft={draft} onChange={onChange} />,
  terminal: ({ draft, onChange }) => <TerminalSection draft={draft} onChange={onChange} />,
  agent: ({ draft, onChange }) => <AgentSection draft={draft} onChange={onChange} />,
  claude: ({ draft, onChange }) => <ClaudeSection draft={draft} onChange={onChange} />,
  codex: ({ draft, onChange }) => <CodexSection draft={draft} onChange={onChange} />,
  providers: ({ draft, onChange }) => <ProvidersSection draft={draft} onChange={onChange} />,
  keybindings: ({ draft, onChange }) => <KeybindingsSection draft={draft} onChange={onChange} />,
  hooks: ({ draft, onChange }) => <HooksSection draft={draft} onChange={onChange} />,
  profiles: ({ draft, onChange }) => <ProfilesSection draft={draft} onChange={onChange} />,
  files: ({ draft, onChange }) => <FileFilterSection draft={draft} onChange={onChange} />,
  integrations: () => <IntegrationsSection />,
  codemode: () => <CodeModeSection />,
  contextDocs: ({ draft, onChange }) => <ContextDocsSection draft={draft} onChange={onChange} />,
  performance: () => <SettingsPerformancePanel />,
};

export function SettingsTabContent({
  activeTab,
  ...sharedProps
}: SettingsTabContentProps): React.ReactElement {
  return TAB_RENDERERS[activeTab](sharedProps);
}
