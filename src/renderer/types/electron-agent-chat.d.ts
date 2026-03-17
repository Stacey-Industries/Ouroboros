import type { AgentChatAPI as MainAgentChatAPI } from '../../main/agentChat/types'

export type {
  ImageAttachment,
  ImageMimeType,
  AgentChatBranchInfo,
  AgentChatContentBlock,
  AgentChatContextBehavior,
  AgentChatContextSummary,
  AgentChatCreateThreadRequest,
  AgentChatDefaultView,
  AgentChatDeleteResult,
  AgentChatErrorCode,
  AgentChatErrorPayload,
  AgentChatEvent,
  AgentChatEventBase,
  AgentChatLinkedDetailsResult,
  AgentChatLinkedTerminalResult,
  AgentChatMessageRecord,
  AgentChatMessageRole,
  AgentChatMessageSource,
  AgentChatMessageStatusKind,
  AgentChatMessageUpdatedEvent,
  AgentChatOrchestrationLink,
  AgentChatSendMessageMetadata,
  AgentChatSendMessageOverrides,
  AgentChatSendMessageRequest,
  AgentChatSendResult,
  AgentChatSettings,
  AgentChatStatusChangedEvent,
  AgentChatStreamChunk,
  AgentChatStreamChunkEvent,
  AgentChatThreadRecord,
  AgentChatThreadResult,
  AgentChatThreadsResult,
  AgentChatThreadStatus,
  AgentChatThreadStatusSnapshot,
  AgentChatThreadUpdatedEvent,
  AgentChatVerificationPreview,
} from '../../main/agentChat/types'

export type AgentChatAPI = MainAgentChatAPI

export type {
  AgentChatEventChannel,
  AgentChatEventType,
  AgentChatInvokeChannel,
} from '../../main/agentChat/events'
