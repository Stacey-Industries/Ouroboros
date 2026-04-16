/** A single message captured from a subagent session. */
export interface SubagentMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  at: number;
}

/** Full lifecycle record for a subagent (child Claude Code session). */
export interface SubagentRecord {
  id: string;
  parentSessionId: string;
  parentThreadId?: string;
  toolCallId?: string;
  taskLabel?: string;
  status: 'running' | 'completed' | 'cancelled' | 'failed';
  startedAt: number;
  endedAt?: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  usdCost: number;
  messages: SubagentMessage[];
  /**
   * PTY session ID if the subagent was spawned as a tracked PTY session.
   * Populated when a hook event correlates the Claude session to a PTY.
   * Used by the cancel handler to issue a real process kill.
   */
  ptySessionId?: string;
}

/** Aggregated cost totals for all subagents under a parent session. */
export interface SubagentCostRollup {
  inputTokens: number;
  outputTokens: number;
  usdCost: number;
  childCount: number;
}
