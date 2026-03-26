/** Shared types for Claude Code native config management (commands, rules, settings). */

// ─── Scope ──────────────────────────────────────────────────────────────────

export type ClaudeConfigScope = 'global' | 'project';

// ─── Commands ───────────────────────────────────────────────────────────────

export interface CommandDefinition {
  /** Filename without .md extension (e.g. "tdd", "blast-radius"). */
  id: string;
  /** Display name — same as id. */
  name: string;
  /** Scope prefix for the slash command: "user" (global) or "project". */
  scope: 'user' | 'project';
  /** Absolute path to the .md file. */
  filePath: string;
  /** Raw file content (the template body). */
  body: string;
  /** First non-empty line of the body, truncated to 80 chars. */
  description: string;
}

// ─── Rules (directory-based) ────────────────────────────────────────────────

export interface RuleDefinition {
  /** Filename without .md extension. */
  id: string;
  /** "global" (~/.claude/rules/) or "project" (.claude/rules/). */
  scope: ClaudeConfigScope;
  /** Absolute path to the .md file. */
  filePath: string;
  /** Raw file content. */
  content: string;
  /** First non-empty line, truncated to 80 chars. */
  description: string;
}
