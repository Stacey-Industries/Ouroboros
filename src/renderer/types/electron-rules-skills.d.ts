import type { CommandDefinition, RuleDefinition } from '@shared/types/claudeConfig';
import type { HooksConfig, RulesFile } from '@shared/types/rulesAndSkills';

export type { CommandDefinition, HooksConfig, RuleDefinition, RulesFile };

type CmdScopeArgs = { scope: string; name: string; projectRoot?: string };
type CmdCreateArgs = CmdScopeArgs & { content: string };

export interface RulesAndSkillsAPI {
  listRules: (projectRoot: string) => Promise<{ success: boolean; rules?: RulesFile[]; error?: string }>;
  readRule: (projectRoot: string, type: 'claude-md' | 'agents-md') => Promise<{ success: boolean; content?: string; error?: string }>;
  createRule: (projectRoot: string, type: 'claude-md' | 'agents-md') => Promise<{ success: boolean; filePath?: string; error?: string }>;
  listCommands: (projectRoot?: string) => Promise<{ success: boolean; commands?: CommandDefinition[]; error?: string }>;
  createCommand: (args: CmdCreateArgs) => Promise<{ success: boolean; filePath?: string; error?: string }>;
  readCommand: (args: CmdScopeArgs) => Promise<{ success: boolean; content?: string; error?: string }>;
  updateCommand: (args: CmdCreateArgs) => Promise<{ success: boolean; error?: string }>;
  deleteCommand: (args: CmdScopeArgs) => Promise<{ success: boolean; error?: string }>;
  listRuleFiles: (projectRoot?: string) => Promise<{ success: boolean; ruleFiles?: RuleDefinition[]; error?: string }>;
  createRuleFile: (args: { scope: string; name: string; content: string; projectRoot?: string }) => Promise<{ success: boolean; filePath?: string; error?: string }>;
  readRuleFile: (args: { scope: string; name: string; projectRoot?: string }) => Promise<{ success: boolean; content?: string; error?: string }>;
  updateRuleFile: (args: { scope: string; name: string; content: string; projectRoot?: string }) => Promise<{ success: boolean; error?: string }>;
  deleteRuleFile: (args: { scope: string; name: string; projectRoot?: string }) => Promise<{ success: boolean; error?: string }>;
  getHooksConfig: (scope: 'global' | 'project', projectRoot?: string) => Promise<{ success: boolean; hooks?: HooksConfig; error?: string }>;
  addHook: (args: { scope: 'global' | 'project'; eventType: string; command: string; matcher?: string; projectRoot?: string }) => Promise<{ success: boolean; error?: string }>;
  removeHook: (args: { scope: 'global' | 'project'; eventType: string; index: number; projectRoot?: string }) => Promise<{ success: boolean; error?: string }>;
  readClaudeSettings: (scope: string, projectRoot?: string) => Promise<{ success: boolean; settings?: Record<string, unknown>; error?: string }>;
  readClaudeSettingsKey: (scope: string, key: string, projectRoot?: string) => Promise<{ success: boolean; value?: unknown; error?: string }>;
  writeClaudeSettingsKey: (args: { scope: string; key: string; value: unknown; projectRoot?: string }) => Promise<{ success: boolean; error?: string }>;
  startWatcher: (projectRoot: string) => Promise<{ success: boolean; error?: string }>;
  onChanged: (callback: () => void) => () => void;
}
