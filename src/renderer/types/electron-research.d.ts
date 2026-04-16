/**
 * electron-research.d.ts — IPC type contract for the research subagent
 * (Wave 25 Phase B).
 *
 * ResearchArtifact is re-exported from @shared/types/research so main
 * process and renderer share a single definition.
 */

export type { ResearchArtifact } from '@shared/types/research';

import type { ResearchArtifact } from '@shared/types/research';

import type { IpcResult } from './electron-foundation';

// ─── Result shapes ────────────────────────────────────────────────────────────

export interface ResearchInvokeResult extends IpcResult {
  artifact?: ResearchArtifact;
}

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
}
