/**
 * chatOrchestrationBridgeTypes.ts — Shared internal types for the orchestration bridge.
 *
 * These types are used across the bridge and its extracted support files.
 */

import type { OrchestrationAPI } from '../orchestration/types';
import type { ResolvedAgentChatSettings } from './settingsResolver';
import type { AgentChatThreadStore } from './threadStore';
import type {
  AgentChatContentBlock,
  AgentChatOrchestrationLink,
  AgentChatStreamChunk,
} from './types';

export type StreamChunkListener = (chunk: AgentChatStreamChunk) => void;

export type OrchestrationClient = Pick<
  OrchestrationAPI,
  'createTask' | 'startTask' | 'loadSession' | 'onProviderEvent' | 'onSessionUpdate'
>;

/**
 * Tracks active streaming sends so that provider event and session update
 * subscriptions can forward progress into the chat stream channel.
 */
export interface ActiveStreamContext {
  threadId: string;
  assistantMessageId: string;
  taskId: string;
  sessionId: string;
  link: AgentChatOrchestrationLink;
  accumulatedText: string;
  firstChunkEmitted: boolean;
  tokenUsage?: { inputTokens: number; outputTokens: number };
  /** Provider-reported cost in USD (set on completion). */
  costUsd?: number;
  /** Resolved model ID (e.g. 'claude-opus-4-6') for this send. */
  model?: string;
  /** Buffered chunks for replay on renderer reconnect (e.g. after HMR/refresh). */
  bufferedChunks: AgentChatStreamChunk[];
  /** Accumulated tool activity for smart title generation */
  toolsUsed: Array<{ name: string; filePath?: string }>;
  /** Accumulated content blocks for message persistence — mirrors streaming blocks */
  accumulatedBlocks: AgentChatContentBlock[];
  /** Whether agent_start has been emitted to Agent Monitor for this session */
  monitorStartEmitted: boolean;
  /** Provider-native session ID (Claude session UUID, Codex thread UUID, etc.) */
  providerSessionId?: string;
  /** User prompt for this thread — used as task label in the Agent Monitor */
  userPrompt?: string;
  /** Timer handle for periodic incremental persistence flush. */
  flushTimer?: ReturnType<typeof setInterval>;
  /** Set to true when a terminal event fires — prevents in-flight flushes from overwriting the final message. */
  streamEnded: boolean;
  /** Estimated history tokens at send time — used for calibration feedback. */
  estimatedHistoryTokens?: number;
}

export interface AgentChatBridgeRuntime {
  createId: () => string;
  getSettings: () => ResolvedAgentChatSettings;
  now: () => number;
  orchestration: OrchestrationClient;
  threadStore: AgentChatThreadStore;
  streamChunkListeners: Set<StreamChunkListener>;
  activeSends: Map<string, ActiveStreamContext>;
}
