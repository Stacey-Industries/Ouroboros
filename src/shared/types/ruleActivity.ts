/**
 * ruleActivity.ts — Types for Rules Activity Indicator and Skill Execution History.
 *
 * Used by both the main process (hook event handling) and the renderer
 * (AgentMonitor state, ChatControlsBar badge, DetailsDrawer section).
 */

export interface LoadedRule {
  filePath: string;
  /** Basename without extension (e.g. "testing" from ".claude/rules/testing.md") */
  name: string;
  memoryType: 'User' | 'Project' | 'Local' | 'Managed';
  loadReason: string;
  globs?: string[];
  loadedAt: number;
}

export interface SkillExecutionRecord {
  skillName: string;
  agentId: string;
  /** Subagent type used for execution (e.g. "Explore", "Plan", "general-purpose") */
  agentType: string;
  startedAt: number;
  completedAt?: number;
  durationMs?: number;
  status: 'running' | 'completed' | 'failed';
  lastMessage?: string;
}

export interface RulesActivitySnapshot {
  sessionId: string;
  rules: LoadedRule[];
  lastUpdated: number;
}
