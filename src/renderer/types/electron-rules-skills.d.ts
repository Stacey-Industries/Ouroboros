import type { HooksConfig, RulesFile, SkillDefinition, SkillExpansionResult } from '@shared/types/rulesAndSkills';

export type { HooksConfig, RulesFile, SkillDefinition, SkillExpansionResult };

export interface RulesAndSkillsAPI {
  listRules: (projectRoot: string) => Promise<{ success: boolean; rules?: RulesFile[]; error?: string }>;
  readRule: (projectRoot: string, type: 'claude-md' | 'agents-md') => Promise<{ success: boolean; content?: string; error?: string }>;
  createRule: (projectRoot: string, type: 'claude-md' | 'agents-md') => Promise<{ success: boolean; filePath?: string; error?: string }>;
  listSkills: (projectRoot: string) => Promise<{ success: boolean; skills?: SkillDefinition[]; error?: string }>;
  expandSkill: (projectRoot: string, skillId: string, params: Record<string, string>, provider?: string) => Promise<{ success: boolean; expansion?: SkillExpansionResult; error?: string }>;
  createSkill: (projectRoot: string, name: string) => Promise<{ success: boolean; filePath?: string; error?: string }>;
  getHooksConfig: (scope: 'global' | 'project', projectRoot?: string) => Promise<{ success: boolean; hooks?: HooksConfig; error?: string }>;
  addHook: (args: { scope: 'global' | 'project'; eventType: string; command: string; matcher?: string; projectRoot?: string }) => Promise<{ success: boolean; error?: string }>;
  removeHook: (args: { scope: 'global' | 'project'; eventType: string; index: number; projectRoot?: string }) => Promise<{ success: boolean; error?: string }>;
  onChanged: (callback: () => void) => () => void;
}
