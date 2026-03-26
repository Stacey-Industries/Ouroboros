/** Shared types for the Rules, Commands, and Hooks management system. */

// ─── Rules ──────────────────────────────────────────────────────────────────

export interface RulesFile {
  type: 'claude-md' | 'agents-md';
  filePath: string;
  exists: boolean;
  content?: string;
  sizeBytes?: number;
  lastModified?: number;
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

