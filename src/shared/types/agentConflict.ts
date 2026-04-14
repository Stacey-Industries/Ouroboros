/**
 * shared/types/agentConflict.ts
 *
 * Cross-session conflict detection types — Wave 6 (#104).
 * Describes overlapping edits between concurrent agent sessions, computed
 * from the codebase graph's blast-radius analysis.
 */

export type ConflictSeverity = 'info' | 'warning' | 'blocking';

export interface GraphNodeRef {
  /** Graph node id (stable across reindex). */
  id: string;
  file: string;
  line?: number;
  /** Graph node kind — 'function', 'class', 'method', 'module', etc. */
  kind: string;
  /** Display name — function/class/method identifier. */
  name: string;
}

export interface AgentConflictReport {
  sessionA: string;
  sessionB: string;
  /** Symbols edited by both sessions (graph-hot path). */
  overlappingSymbols: GraphNodeRef[];
  /** Files edited by both sessions (always populated, graph-cold fallback). */
  overlappingFiles: string[];
  severity: ConflictSeverity;
  /** Unix ms timestamp of most recent update. */
  updatedAt: number;
  /** True when graph was cold and overlap was computed from files only. */
  fileOnly: boolean;
}

export interface AgentConflictSnapshot {
  reports: AgentConflictReport[];
  /** Mapping from session id to the files it has touched this run. */
  sessionFiles: Record<string, string[]>;
}
