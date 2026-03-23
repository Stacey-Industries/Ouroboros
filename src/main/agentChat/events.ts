import type { AgentChatEvent, AgentChatThreadStatus } from './types';

// Re-export everything from shared so existing imports of this file continue to work
export type {
  AgentChatEventChannel,
  AgentChatEventType,
  AgentChatInvokeChannel,
} from '@shared/ipc/agentChatChannels';
export {
  AGENT_CHAT_EVENT_CHANNELS,
  AGENT_CHAT_EVENT_TYPES,
  AGENT_CHAT_INVOKE_CHANNELS,
  AGENT_CHAT_STATUS_NAMES,
} from '@shared/ipc/agentChatChannels';

// Keep the satisfies constraints here so the main process can validate the types
// at compile time. These are not re-exported (they're inferred in the shared file).
import {
  AGENT_CHAT_EVENT_TYPES as _EVENT_TYPES,
  AGENT_CHAT_STATUS_NAMES as _STATUS_NAMES,
} from '@shared/ipc/agentChatChannels';

// Type-check that shared constants satisfy the expected types
const _statusCheck: Record<string, AgentChatThreadStatus> = _STATUS_NAMES;
const _eventCheck: Record<string, AgentChatEvent['type']> = _EVENT_TYPES;

// Suppress unused variable warnings — these exist only to validate types
void _statusCheck;
void _eventCheck;
