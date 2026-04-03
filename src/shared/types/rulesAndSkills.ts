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
  // Lifecycle
  | 'SessionStart'
  | 'SessionEnd'
  | 'Stop'
  | 'StopFailure'
  | 'Setup'
  // Tools
  | 'PreToolUse'
  | 'PostToolUse'
  | 'PostToolUseFailure'
  // Agents
  | 'SubagentStart'
  | 'SubagentStop'
  | 'TeammateIdle'
  // Tasks
  | 'TaskCreated'
  | 'TaskCompleted'
  // Conversation
  | 'UserPromptSubmit'
  | 'Elicitation'
  | 'ElicitationResult'
  | 'Notification'
  // Workspace
  | 'CwdChanged'
  | 'FileChanged'
  | 'WorktreeCreate'
  | 'WorktreeRemove'
  | 'ConfigChange'
  // Context
  | 'PreCompact'
  | 'PostCompact'
  | 'InstructionsLoaded'
  // Permissions
  | 'PermissionRequest'
  | 'PermissionDenied';

export type HooksConfig = Record<string, ClaudeHookMatcher[]>;

