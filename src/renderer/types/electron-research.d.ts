/**
 * electron-research.d.ts — IPC type contract for the research subagent
 * (Wave 25 Phase B), research mode controls (Wave 30 Phase G), and the
 * research metrics dashboard (Wave 30 Phase H).
 *
 * ResearchArtifact is re-exported from @shared/types/research so main
 * process and renderer share a single definition.
 */

export type { ResearchArtifact } from '@shared/types/research';

import type { ResearchArtifact } from '@shared/types/research';

import type { IpcResult } from './electron-foundation';

// ─── Shared mode type ─────────────────────────────────────────────────────────

export type ResearchMode = 'off' | 'conservative' | 'aggressive';

// ─── Result shapes ────────────────────────────────────────────────────────────

export interface ResearchInvokeResult extends IpcResult {
  artifact?: ResearchArtifact;
}

export type ResearchSessionModeResult =
  | { success: true; mode: ResearchMode }
  | { success: false; error: string };

export type ResearchGlobalDefaultResult =
  | { success: true; globalEnabled: boolean; defaultMode: ResearchMode }
  | { success: false; error: string };

// ─── API interface ────────────────────────────────────────────────────────────

export interface ResearchAPI {
  /**
   * Run a research subagent for the given topic/library/version.
   * Returns a cached artifact immediately if a valid cache entry exists.
   * Always resolves — never throws. Returns a low-confidence failure artifact
   * if the subagent times out or errors.
   */
  invoke(input: {
    topic: string;
    library?: string;
    version?: string;
  }): Promise<ResearchInvokeResult>;

  // ── Wave 30 Phase G — per-session mode + global default controls ──────────

  /** Get the current research mode for a given session ID. */
  getSessionMode(sessionId: string): Promise<ResearchSessionModeResult>;

  /** Set the research mode for a given session ID. */
  setSessionMode(sessionId: string, mode: ResearchMode): Promise<IpcResult>;

  /** Get the global auto-research enabled flag and default mode from config. */
  getGlobalDefault(): Promise<ResearchGlobalDefaultResult>;

  /** Persist the global auto-research enabled flag and default mode to config. */
  setGlobalDefault(globalEnabled: boolean, defaultMode: ResearchMode): Promise<IpcResult>;

  // ── Wave 30 Phase H — research metrics dashboard ──────────────────────────

  /** Fetch pre-aggregated research metrics for the given time range. */
  getDashboardMetrics(
    range: '7d' | '30d' | 'all',
  ): Promise<
    | { success: true; metrics: ResearchDashboardMetrics }
    | { success: false; error: string }
  >;
}

// ─── Dashboard metrics shape ──────────────────────────────────────────────────

export interface ResearchDashboardMetrics {
  range: '7d' | '30d' | 'all';
  window: { fromIso: string; toIso: string };
  invocations: {
    total: number;
    byTrigger: Record<'hook' | 'fact-claim' | 'slash' | 'correction' | 'other', number>;
    cacheHitRate: number;
    avgLatencyMs: number;
    p95LatencyMs: number;
  };
  outcomes: {
    total: number;
    accepted: number;
    reverted: number;
    unknown: number;
    acceptanceRate: number;
  };
  correlated: {
    firedCount: number;
    outcomeCorrelatedCount: number;
    falsePositiveCount: number;
    falsePositiveRate: number;
  };
  corrections: {
    total: number;
    enhancedLibrariesCount: number;
  };
}
