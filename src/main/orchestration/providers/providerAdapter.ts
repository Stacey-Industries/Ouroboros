import type { BrowserWindow } from 'electron'

import type {
  ContextPacket,
  OrchestrationProvider,
  ProviderArtifact,
  ProviderCapabilities,
  ProviderExecutionStatus,
  ProviderProgressEvent,
  ProviderSessionReference,
  TaskRequest,
} from '../types'

export interface ProviderProgressSink {
  emit: (event: ProviderProgressEvent) => void
}

export interface ProviderLaunchContext {
  taskId: string
  sessionId: string
  attemptId: string
  request: TaskRequest
  contextPacket: ContextPacket
  window?: BrowserWindow | null
}

export interface ProviderResumeContext {
  taskId: string
  sessionId: string
  attemptId: string
  request: TaskRequest
  providerSession?: ProviderSessionReference
  contextPacket?: ContextPacket
  window?: BrowserWindow | null
}

export interface ProviderLaunchResult {
  artifact: ProviderArtifact
  session: ProviderSessionReference
  responseText?: string
  toolsUsed?: Array<{ name: string; input?: unknown }>
  costUsd?: number
  durationMs?: number
}

export interface ProviderArtifactInput {
  provider: OrchestrationProvider
  status: ProviderExecutionStatus
  session: ProviderSessionReference
  submittedAt: number
  lastMessage?: string
  completedAt?: number
}

export interface ProviderAdapter {
  readonly provider: OrchestrationProvider
  getCapabilities: () => ProviderCapabilities
  submitTask: (context: ProviderLaunchContext, sink: ProviderProgressSink) => Promise<ProviderLaunchResult>
  resumeTask: (context: ProviderResumeContext, sink: ProviderProgressSink) => Promise<ProviderLaunchResult>
  cancelTask: (session: ProviderSessionReference) => Promise<void>
}

export function createProviderSessionReference(
  provider: OrchestrationProvider,
  values: Partial<Omit<ProviderSessionReference, 'provider'>> = {},
): ProviderSessionReference {
  return {
    provider,
    ...values,
  }
}

export function createProviderArtifact(input: ProviderArtifactInput): ProviderArtifact {
  return {
    provider: input.provider,
    status: input.status,
    submittedAt: input.submittedAt,
    completedAt: input.completedAt,
    session: input.session,
    lastMessage: input.lastMessage,
  }
}

export function createProviderProgressEvent(
  status: import('../types').ProviderExecutionStatus,
  fields: Partial<import('../types').ProviderProgressEvent> = {},
): import('../types').ProviderProgressEvent {
  return { status, ...fields } as import('../types').ProviderProgressEvent
}


