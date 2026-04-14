/**
 * settingsTabs.ts — Tab definitions shared by SettingsModal and SettingsPanel.
 *
 * Two-level hierarchy: MainTabId (top row) → TabId (subtab row).
 * Section components only see TabId — the main tab layer is purely navigational.
 */

export type TabId =
  | 'accounts'
  | 'general'
  | 'appearance'
  | 'fonts'
  | 'terminal'
  | 'agent'
  | 'claude'
  | 'codex'
  | 'providers'
  | 'keybindings'
  | 'hooks'
  | 'profiles'
  | 'files'
  | 'integrations'
  | 'codemode'
  | 'contextDocs'
  | 'performance';

export interface Tab {
  id: TabId;
  label: string;
}

/** Flat list of all tabs — used for label lookup and search validation. */
export const TABS: Tab[] = [
  { id: 'accounts', label: 'Accounts' },
  { id: 'general', label: 'General' },
  { id: 'appearance', label: 'Appearance' },
  { id: 'fonts', label: 'Fonts' },
  { id: 'terminal', label: 'Terminal' },
  { id: 'agent', label: 'Agent' },
  { id: 'claude', label: 'Claude Code' },
  { id: 'codex', label: 'Codex' },
  { id: 'providers', label: 'Providers' },
  { id: 'keybindings', label: 'Keybindings' },
  { id: 'hooks', label: 'Hooks' },
  { id: 'profiles', label: 'Profiles' },
  { id: 'files', label: 'Files' },
  { id: 'integrations', label: 'Integrations' },
  { id: 'codemode', label: 'Code Mode' },
  { id: 'contextDocs', label: 'Context Docs' },
  { id: 'performance', label: 'Performance' },
];

/* ── Two-level tab hierarchy ─────────────────────────────── */

export type MainTabId =
  | 'account'
  | 'appearance'
  | 'terminalEditor'
  | 'aiAgents'
  | 'general';

export interface MainTab {
  id: MainTabId;
  label: string;
  subtabs: TabId[];
}

export const MAIN_TABS: MainTab[] = [
  { id: 'account',        label: 'Account',           subtabs: ['accounts', 'providers'] },
  { id: 'appearance',     label: 'Appearance',        subtabs: ['appearance', 'fonts', 'profiles'] },
  { id: 'terminalEditor', label: 'Terminal & Editor',  subtabs: ['terminal', 'keybindings', 'files'] },
  { id: 'aiAgents',       label: 'AI Agents',         subtabs: ['agent', 'claude', 'codex', 'codemode', 'contextDocs'] },
  { id: 'general',        label: 'General',           subtabs: ['general', 'hooks', 'integrations', 'performance'] },
];

const SUBTAB_LABELS = new Map<TabId, string>(
  TABS.map((t) => [t.id, t.label]),
);

/** Look up the display label for a subtab. */
export function getSubTabLabel(sub: TabId): string {
  return SUBTAB_LABELS.get(sub) ?? sub;
}

const SUBTAB_TO_MAIN = new Map<TabId, MainTabId>(
  MAIN_TABS.flatMap((m) => m.subtabs.map((s) => [s, m.id] as const)),
);

/** Resolve a subtab ID to its parent main tab. Falls back to 'general'. */
export function getMainTabForSubTab(sub: TabId): MainTabId {
  return SUBTAB_TO_MAIN.get(sub) ?? 'general';
}

/** Get the default (first) subtab for a main tab. */
export function getDefaultSubTab(main: MainTabId): TabId {
  const entry = MAIN_TABS.find((m) => m.id === main);
  return entry ? entry.subtabs[0] : 'general';
}
