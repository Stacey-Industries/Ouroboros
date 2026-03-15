import type { OrchestrationEvent, OrchestrationStatus } from './types'

export const ORCHESTRATION_INVOKE_CHANNELS = {
  createTask: 'orchestration:createTask',
  startTask: 'orchestration:startTask',
  previewContext: 'orchestration:previewContext',
  buildContextPacket: 'orchestration:buildContextPacket',
  loadSession: 'orchestration:loadSession',
  loadSessions: 'orchestration:loadSessions',
  loadLatestSession: 'orchestration:loadLatestSession',
  updateSession: 'orchestration:updateSession',
  resumeTask: 'orchestration:resumeTask',
  rerunVerification: 'orchestration:rerunVerification',
  cancelTask: 'orchestration:cancelTask',
  pauseTask: 'orchestration:pauseTask',
} as const

export const ORCHESTRATION_EVENT_CHANNELS = {
  state: 'orchestration:state',
  provider: 'orchestration:provider',
  verification: 'orchestration:verification',
  session: 'orchestration:session',
  event: 'orchestration:event',
} as const

export const ORCHESTRATION_STATE_NAMES = {
  idle: 'idle',
  selectingContext: 'selecting_context',
  awaitingProvider: 'awaiting_provider',
  applying: 'applying',
  verifying: 'verifying',
  needsReview: 'needs_review',
  complete: 'complete',
  failed: 'failed',
  cancelled: 'cancelled',
  paused: 'paused',
} as const satisfies Record<string, OrchestrationStatus>

export type OrchestrationInvokeChannel =
  (typeof ORCHESTRATION_INVOKE_CHANNELS)[keyof typeof ORCHESTRATION_INVOKE_CHANNELS]

export type OrchestrationEventChannel =
  (typeof ORCHESTRATION_EVENT_CHANNELS)[keyof typeof ORCHESTRATION_EVENT_CHANNELS]

export const ORCHESTRATION_EVENT_TYPES = {
  stateChanged: 'state_changed',
  providerProgress: 'provider_progress',
  verificationUpdated: 'verification_updated',
  sessionUpdated: 'session_updated',
  taskResult: 'task_result',
} as const satisfies Record<string, OrchestrationEvent['type']>

export type OrchestrationEventType =
  (typeof ORCHESTRATION_EVENT_TYPES)[keyof typeof ORCHESTRATION_EVENT_TYPES]
