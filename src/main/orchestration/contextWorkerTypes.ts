/**
 * contextWorkerTypes.ts -- Shared message types for main <-> context worker
 * communication. Plain JSON-safe types only -- no class instances.
 */

import type { RepoIndexSnapshot } from './repoIndexer'
import type { ContextPacket } from './types'

// -- Main -> Worker --------------------------------------------------------

export interface ContextWorkerBuildRequest {
  type: 'buildContext'
  id: string
  roots: string[]
}

export type ContextWorkerRequest = ContextWorkerBuildRequest

// -- Worker -> Main --------------------------------------------------------

export interface ContextWorkerReadyResponse {
  type: 'ready'
}

export interface ContextWorkerContextResponse {
  type: 'contextReady'
  id: string
  snapshot: RepoIndexSnapshot
  packet?: ContextPacket
  durationMs: number
}

export interface ContextWorkerErrorResponse {
  type: 'error'
  id: string
  message: string
}

export type ContextWorkerResponse =
  | ContextWorkerReadyResponse
  | ContextWorkerContextResponse
  | ContextWorkerErrorResponse
