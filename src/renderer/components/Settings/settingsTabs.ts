/**
 * settingsTabs.ts — Tab definitions shared by SettingsModal and SettingsPanel.
 */

export type TabId =
  | 'general'
  | 'appearance'
  | 'fonts'
  | 'terminal'
  | 'agent'
  | 'claude'
  | 'keybindings'
  | 'hooks'
  | 'profiles'
  | 'files'
  | 'extensions'
  | 'mcp'
  | 'mcpStore'
  | 'extensionStore'
  | 'codemode';

export interface Tab {
  id: TabId;
  label: string;
}

export const TABS: Tab[] = [
  { id: 'general', label: 'General' },
  { id: 'appearance', label: 'Appearance' },
  { id: 'fonts', label: 'Fonts' },
  { id: 'terminal', label: 'Terminal' },
  { id: 'agent', label: 'Agent' },
  { id: 'claude', label: 'Claude Code' },
  { id: 'keybindings', label: 'Keybindings' },
  { id: 'hooks', label: 'Hooks' },
  { id: 'profiles', label: 'Profiles' },
  { id: 'files', label: 'Files' },
  { id: 'extensions', label: 'Extensions' },
  { id: 'mcp', label: 'MCP Servers' },
  { id: 'mcpStore', label: 'MCP Store' },
  { id: 'extensionStore', label: 'Extension Store' },
  { id: 'codemode', label: 'Code Mode' },
];
