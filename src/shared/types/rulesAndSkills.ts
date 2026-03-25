/** Shared types for the Rules, Skills/Workflows, and Hooks management system. */

import type { OrchestrationProvider } from './orchestrationDomain';

// ─── Rules ──────────────────────────────────────────────────────────────────

export interface RulesFile {
  type: 'claude-md' | 'agents-md';
  filePath: string;
  exists: boolean;
  content?: string;
  sizeBytes?: number;
  lastModified?: number;
}

// ─── Skills ─────────────────────────────────────────────────────────────────

export interface SkillParameter {
  name: string;
  description: string;
  required: boolean;
  default?: string;
}

export interface SkillDefinition {
  id: string;
  name: string;
  description: string;
  parameters: SkillParameter[];
  tags: string[];
  filePath: string;
  body: string;
}

export interface SkillExpansionResult {
  expandedBody: string;
  provider: OrchestrationProvider;
  skillId: string;
}

// ─── Hooks ───────────────────────────────────────────────────────────────────

export interface ClaudeHookEntry {
  type: 'command';
  command: string;
}

export interface ClaudeHookMatcher {
  hooks: ClaudeHookEntry[];
  matcher?: string;
}

export type HookEventType =
  | 'PreToolUse'
  | 'PostToolUse'
  | 'SubagentStart'
  | 'SubagentStop'
  | 'SessionStart'
  | 'Stop';

export type HooksConfig = Record<string, ClaudeHookMatcher[]>;

// ─── Summary ─────────────────────────────────────────────────────────────────

export interface RulesAndSkillsSummary {
  rules: RulesFile[];
  skills: SkillDefinition[];
}
