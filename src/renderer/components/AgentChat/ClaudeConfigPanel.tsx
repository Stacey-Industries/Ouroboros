import React, { useState } from 'react';

import type { CommandDefinition } from '../../../shared/types/claudeConfig';
import type { RulesFile } from '../../../shared/types/rulesAndSkills';
import { ConfigTabBar, type ConfigTabId } from './ClaudeConfigPanelParts';
import { CommandsTab } from './CommandsTab';
import { HooksTab } from './HooksTab';
import { RulesTab } from './RulesTab';
import { SettingsTab } from './SettingsTab';

// ── Props ───────────────────────────────────────────────────────────────────

export interface ClaudeConfigPanelProps {
  rules: RulesFile[];
  commands: CommandDefinition[];
  onOpenFile: (filePath: string) => void;
  onCreateRule: (type: 'claude-md' | 'agents-md') => Promise<void>;
  onOpenHooksSettings: () => void;
  isLoading: boolean;
  projectRoot: string | null;
}

// ── Tab dispatcher ──────────────────────────────────────────────────────────

function renderTabContent(
  activeTab: ConfigTabId,
  props: ClaudeConfigPanelProps,
): React.ReactElement<any> {
  switch (activeTab) {
    case 'commands':
      return <CommandsTab commands={props.commands} onOpenFile={props.onOpenFile} projectRoot={props.projectRoot} />;
    case 'rules':
      return <RulesTab rules={props.rules} onOpenFile={props.onOpenFile} onCreateRule={props.onCreateRule} projectRoot={props.projectRoot} />;
    case 'hooks':
      return <HooksTab projectRoot={props.projectRoot} />;
    case 'settings':
      return <SettingsTab projectRoot={props.projectRoot} />;
  }
}

// ── Panel ───────────────────────────────────────────────────────────────────

export function ClaudeConfigPanel(props: ClaudeConfigPanelProps): React.ReactElement<any> {
  const [activeTab, setActiveTab] = useState<ConfigTabId>('commands');

  return (
    <div className="flex flex-col h-full overflow-hidden bg-surface-panel">
      <ConfigTabBar activeTab={activeTab} onTabChange={setActiveTab} />
      <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
        {props.isLoading
          ? <div className="px-3 py-2 text-[10px] text-text-semantic-muted animate-pulse">Loading...</div>
          : renderTabContent(activeTab, props)}
      </div>
    </div>
  );
}
