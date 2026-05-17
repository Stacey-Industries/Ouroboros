/**
 * repoMapWorkerTypes.ts — Discriminated-union message types for
 * main-process ↔ repoMapWorker communication.
 *
 * All values must be plain JSON-serialisable — no class instances,
 * no WASM objects, no Buffer/ArrayBuffer.
 */

import type { RepoIndexSnapshot } from '../orchestration/repoIndexer';
import type { RepoFacts } from '../orchestration/types';
import type { RepoMap } from './contextLayerTypes';

// ── Main → Worker ─────────────────────────────────────────────────────────────

export interface GenerateRepoMapRequest {
  type: 'generateRepoMap';
  id: string;
  repoFacts: RepoFacts;
  repoIndex: RepoIndexSnapshot;
  workspaceRoot: string;
  model?: string;
}

export type RepoMapWorkerRequest = GenerateRepoMapRequest;

// ── Worker → Main ─────────────────────────────────────────────────────────────

export interface RepoMapWorkerReadyResponse {
  type: 'ready';
}

export interface RepoMapWorkerResultResponse {
  type: 'repoMapReady';
  id: string;
  repoMap: RepoMap;
  durationMs: number;
}

export interface RepoMapWorkerErrorResponse {
  type: 'error';
  id: string;
  message: string;
}

export type RepoMapWorkerResponse =
  | RepoMapWorkerReadyResponse
  | RepoMapWorkerResultResponse
  | RepoMapWorkerErrorResponse;
