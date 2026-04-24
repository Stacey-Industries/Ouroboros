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
  textDelta?: string;
  thinkingDelta?: string;
  blockIndex?: number;
  toolActivity?: AgentChatStreamChunkToolActivity;
  tokenUsage?: { inputTokens: number; outputTokens: number };
  thread?: AgentChatThreadRecord;
}
