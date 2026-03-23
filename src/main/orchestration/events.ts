import type { OrchestrationEvent, OrchestrationStatus } from './types';

// Re-export everything from shared so existing imports of this file continue to work
export type {
  OrchestrationEventChannel,
  OrchestrationEventType,
  OrchestrationInvokeChannel,
} from '@shared/ipc/orchestrationChannels';
export {
  ORCHESTRATION_EVENT_CHANNELS,
  ORCHESTRATION_EVENT_TYPES,
  ORCHESTRATION_INVOKE_CHANNELS,
  ORCHESTRATION_STATE_NAMES,
} from '@shared/ipc/orchestrationChannels';

// Keep the satisfies constraints here so the main process can validate the types
// at compile time.
import {
  ORCHESTRATION_EVENT_TYPES as _EVENT_TYPES,
  ORCHESTRATION_STATE_NAMES as _STATE_NAMES,
} from '@shared/ipc/orchestrationChannels';

// Type-check that shared constants satisfy the expected types
const _stateCheck: Record<string, OrchestrationStatus> = _STATE_NAMES;
const _eventCheck: Record<string, OrchestrationEvent['type']> = _EVENT_TYPES;

// Suppress unused variable warnings — these exist only to validate types
void _stateCheck;
void _eventCheck;
