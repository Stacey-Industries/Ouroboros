import type { AgentChatSubToolActivity, AgentChatThreadRecord } from './agentChat';

export interface AgentChatStreamChunkToolActivity {
  name: string;
  status: 'running' | 'complete' | 'error';
  filePath?: string;
  inputSummary?: string;
  editSummary?: { oldLines: number; newLines: number } | string;
  output?: string;
  subTool?: AgentChatSubToolActivity;
  subAgentMessage?: {
    entryId: string;
    subAgentId: string;
    label?: string;
    kind: 'text' | 'thinking';
    textDelta: string;
  };
}

export interface AgentChatStreamChunk {
  type:
    | 'text_delta'
    | 'thinking_delta'
    | 'tool_activity'
    | 'complete'
    | 'error'
    | 'thread_snapshot';
  messageId: string;
  threadId?: string;
  timestamp?: number;
  /**
   * Monotonic per-turn sequence stamped by the bridge at emit time. Used as
   * the dedup key on the renderer — `timestamp` alone (ms precision) collides
   * for providers that stream multiple deltas per ms on the same block
   * (e.g. Codex app-server's per-token `item/agentMessage/delta` events).
   */
  seq?: number;
  textDelta?: string;
  thinkingDelta?: string;
  blockIndex?: number;
  toolActivity?: AgentChatStreamChunkToolActivity;
  tokenUsage?: { inputTokens: number; outputTokens: number };
  thread?: AgentChatThreadRecord;
}
