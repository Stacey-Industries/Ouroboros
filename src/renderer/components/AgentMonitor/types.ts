/**
 * types.ts — AgentMonitor domain types.
 *
 * Describes the shape of agent sessions, tool call events, and the raw
 * hook payloads delivered via the named-pipe → IPC bridge.
 */

export type AgentStatus = 'idle' | 'running' | 'complete' | 'error';

export interface AgentSession {
  id: string;
  taskLabel: string;       // parsed from spawn prompt
  status: AgentStatus;
  startedAt: number;       // ms timestamp
  completedAt?: number;    // ms timestamp
  toolCalls: ToolCallEvent[];
  error?: string;
  parentSessionId?: string; // present when this agent was spawned by another agent
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  model?: string;          // e.g. "claude-sonnet-4-20250514"
  restored?: boolean;      // true when loaded from disk (not from a live event)
}

export interface ToolCallEvent {
  id: string;
  toolName: string;        // Read, Bash, Edit, Grep, Write, etc.
  input: string;           // truncated summary (e.g., file path, command)
  timestamp: number;
  duration?: number;       // ms
  status: 'pending' | 'success' | 'error';
  output?: string;         // full tool output/result text (populated on TOOL_END)
}

/**
 * Raw payload received from Claude Code hooks via the named-pipe server.
 * Maps to the NDJSON lines emitted by hook scripts.
 */
/**
 * Token usage data that may be included in hook event payloads.
 * Claude Code may include these fields in `agent_end` or `assistant_response` events,
 * or within the `usage` field of any event payload.
 *
 * Known field names to look for:
 *   - usage.input_tokens / usage.output_tokens (API response format)
 *   - usage.cache_read_input_tokens / usage.cache_creation_input_tokens
 *   - input_tokens / output_tokens (flat on payload)
 */
export interface TokenUsage {
  input_tokens?: number;
  output_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
}

export interface HookPayload {
  type: 'agent_start' | 'pre_tool_use' | 'post_tool_use' | 'agent_end' | 'agent_stop' | 'session_start' | 'session_stop';
  sessionId: string;
  toolName?: string;
  toolCallId?: string;
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
  prompt?: string;        // for agent_start — used to derive taskLabel
  error?: string;         // for agent_end with error
  parentSessionId?: string; // for agent_start — links subagent to parent
  timestamp: number;
  usage?: TokenUsage;     // token usage data (may appear on agent_end or any event)
  model?: string;         // model identifier (e.g. "claude-sonnet-4-20250514")
}
