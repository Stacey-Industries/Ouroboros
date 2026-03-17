// ---------------------------------------------------------------------------
// Stream-JSON types for Claude Code's `--output-format stream-json` NDJSON
// ---------------------------------------------------------------------------

// --- Content blocks within assistant messages ---

export interface StreamJsonTextBlock {
  type: 'text'
  text: string
}

export interface StreamJsonToolUseBlock {
  type: 'tool_use'
  id: string
  name: string
  input: Record<string, unknown>
}

export interface StreamJsonThinkingBlock {
  type: 'thinking'
  thinking: string
}

export interface StreamJsonToolResultBlock {
  type: 'tool_result'
  tool_use_id: string
  content: string | unknown
}

export type StreamJsonContentBlock =
  | StreamJsonTextBlock
  | StreamJsonToolUseBlock
  | StreamJsonThinkingBlock
  | StreamJsonToolResultBlock

// --- Top-level NDJSON events ---

export interface StreamJsonSystemEvent {
  type: 'system'
  subtype: 'init' | 'hook_started' | 'hook_response'
  session_id?: string
  [key: string]: unknown
}

export interface StreamJsonAssistantEvent {
  type: 'assistant'
  message: {
    role: 'assistant'
    content: StreamJsonContentBlock[]
    model?: string
    stop_reason?: string | null
    usage?: {
      input_tokens?: number
      output_tokens?: number
      cache_read_input_tokens?: number
      cache_creation_input_tokens?: number
    }
  }
  session_id?: string
  parent_tool_use_id?: string | null
}

export interface StreamJsonResultEvent {
  type: 'result'
  subtype: 'success' | 'error'
  is_error: boolean
  result: string
  duration_ms?: number
  total_cost_usd?: number
  session_id?: string
  stop_reason?: string
  usage?: Record<string, unknown>
}

export type StreamJsonEvent =
  | StreamJsonSystemEvent
  | StreamJsonAssistantEvent
  | StreamJsonResultEvent

// --- Process handle & spawn options ---

export interface StreamJsonProcessHandle {
  result: Promise<StreamJsonResultEvent>
  kill: () => void
  pid: number | undefined
  sessionId: string | null
}

export interface StreamJsonSpawnOptions {
  prompt: string
  cwd: string
  model?: string
  permissionMode?: string
  dangerouslySkipPermissions?: boolean
  resumeSessionId?: string
  continueSession?: boolean
  /** Effort level override: 'low' | 'medium' | 'high' | 'max', or a numeric string for explicit --max-turns */
  effort?: string
  env?: Record<string, string>
  onEvent?: (event: StreamJsonEvent) => void
}
