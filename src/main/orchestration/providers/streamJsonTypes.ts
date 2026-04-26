// ---------------------------------------------------------------------------
// Stream-JSON types for Claude Code's `--output-format stream-json` NDJSON
// ---------------------------------------------------------------------------

// --- Content blocks within assistant messages ---

export interface StreamJsonTextBlock {
  type: 'text';
  text: string;
}

export interface StreamJsonToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface StreamJsonThinkingBlock {
  type: 'thinking';
  thinking: string;
}

export interface StreamJsonToolResultBlock {
  type: 'tool_result';
  tool_use_id: string;
  content: string | unknown;
}

export type StreamJsonContentBlock =
  | StreamJsonTextBlock
  | StreamJsonToolUseBlock
  | StreamJsonThinkingBlock
  | StreamJsonToolResultBlock;

// --- Top-level NDJSON events ---

export interface StreamJsonSystemEvent {
  type: 'system';
  subtype: 'init' | 'hook_started' | 'hook_response';
  session_id?: string;
  [key: string]: unknown;
}

export interface StreamJsonAssistantEvent {
  type: 'assistant';
  message: {
    role: 'assistant';
    content: StreamJsonContentBlock[];
    model?: string;
    stop_reason?: string | null;
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
      cache_read_input_tokens?: number;
      cache_creation_input_tokens?: number;
    };
  };
  session_id?: string;
  parent_tool_use_id?: string | null;
}

export interface StreamJsonUserEvent {
  type: 'user';
  message: {
    role: 'user';
    content: unknown;
  };
  session_id?: string;
}

export interface StreamJsonResultEvent {
  type: 'result';
  subtype: 'success' | 'error' | 'error_during_execution';
  is_error: boolean;
  result: string;
  errors?: string[];
  duration_ms?: number;
  total_cost_usd?: number;
  session_id?: string;
  stop_reason?: string;
  usage?: Record<string, unknown>;
}

export type StreamJsonEvent =
  | StreamJsonSystemEvent
  | StreamJsonAssistantEvent
  | StreamJsonUserEvent
  | StreamJsonResultEvent;

// --- Process handle & spawn options ---

export interface StreamJsonProcessHandle {
  result: Promise<StreamJsonResultEvent>;
  kill: () => void;
  pid: number | undefined;
  sessionId: string | null;
}

export interface StreamJsonSpawnOptions {
  prompt: string;
  cwd: string;
  model?: string;
  permissionMode?: string;
  dangerouslySkipPermissions?: boolean;
  resumeSessionId?: string;
  continueSession?: boolean;
  /** Effort level override: 'low' | 'medium' | 'high' | 'max', or a numeric string for explicit --max-turns */
  effort?: string;
  /** Comma-separated allowlist passed to --allowedTools. */
  allowedTools?: string;
  /** Comma-separated denylist passed to --disallowedTools. */
  disallowedTools?: string;
  /** Extra text appended to Claude Code's system prompt via --append-system-prompt. */
  appendSystemPrompt?: string;
  /** Additional working directories exposed to the agent via --add-dir (one flag per entry). */
  addDirs?: string[];
  /** Spend cap in USD passed to --max-budget-usd. Only emitted when > 0. */
  maxBudgetUsd?: number;
  /**
   * Wave 48 Phase D — path to a scoped MCP config JSON file.
   * When set, appends --mcp-config <path> and --strict-mcp-config so the
   * spawned claude sees only the servers listed in that file.
   */
  mcpConfigPath?: string;
  env?: Record<string, string>;
  onEvent?: (event: StreamJsonEvent) => void;
  /** Optional trace ID for orchestration_traces telemetry. Generated internally if omitted. */
  traceId?: string;
  /** Optional session ID for orchestration_traces telemetry. Defaults to 'unknown' until stream provides one. */
  telemetrySessionId?: string;
  /**
   * When true, spawns in warm/long-lived mode:
   * - Adds --input-format stream-json so stdin stays open for multi-turn NDJSON.
   * - stdin is NOT closed after the first write; the caller manages the process lifetime.
   */
  warmMode?: boolean;
}

// --- Warm process handle (long-lived multi-turn process) ---

export interface WarmStreamJsonHandle {
  /**
   * Send a single user turn and await its result event.
   * Sets the active onEvent callback for the duration of this turn.
   */
  sendTurn: (
    content: string,
    onEvent: (event: StreamJsonEvent) => void,
  ) => Promise<StreamJsonResultEvent>;
  /**
   * Inject a user message mid-turn without creating a new pending turn.
   * Events continue to flow to the currently-active turn's onEvent callback.
   * Logs a warning and drops the message if there is no active turn.
   */
  injectUserMessage: (content: string) => void;
  /** Graceful shutdown: end stdin, then force-kill after a short timeout. */
  kill: () => void;
  pid: number | undefined;
  /** The session_id captured from the first event that carries one. */
  readonly sessionId: string | null;
}
