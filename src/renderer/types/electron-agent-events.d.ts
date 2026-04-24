export type AgentEventType =
  | 'session_start'
  | 'session_end'
  | 'session_stop'
  | 'stop_failure'
  | 'setup'
  | 'pre_tool_use'
  | 'post_tool_use'
  | 'post_tool_use_failure'
  | 'agent_start'
  | 'agent_end'
  | 'agent_stop'
  | 'teammate_idle'
  | 'task_created'
  | 'task_completed'
  | 'user_prompt_submit'
  | 'elicitation'
  | 'elicitation_result'
  | 'notification'
  | 'cwd_changed'
  | 'file_changed'
  | 'worktree_create'
  | 'worktree_remove'
  | 'config_change'
  | 'pre_compact'
  | 'post_compact'
  | 'instructions_loaded'
  | 'permission_request'
  | 'permission_denied';

export interface AgentEvent {
  type: AgentEventType;
  sessionId?: string;
  agentId?: string;
  timestamp: number;
  payload: unknown;
}

export interface RawApiTokenUsage {
  input_tokens?: number;
  output_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
}

export interface HookPayload {
  type: AgentEventType;
  sessionId: string;
  timestamp: number;
  toolName?: string;
  toolCallId?: string;
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
  prompt?: string;
  error?: string;
  parentSessionId?: string;
  usage?: RawApiTokenUsage;
  model?: string;
  requestId?: string;
  cwd?: string;
  internal?: boolean;
  ideSpawned?: boolean;
  costUsd?: number;
  parentToolCallId?: string;
  taskLabel?: string;
  data?: Record<string, unknown>;
}
