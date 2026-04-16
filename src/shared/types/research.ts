/**
 * research.ts — Shared types for the research subagent pipeline (Wave 25 Phase B).
 *
 * Used by main process (subagent, cache, IPC handlers), renderer (UI), and
 * preload (bridge). Kept in @shared so all three processes can import it.
 */

export interface ResearchArtifact {
  /** UUID v4 — also used as the artifact id and correlationId for attribution */
  id: string;
  /** User-provided research topic */
  topic: string;
  /** Detected library, if any (e.g. "next.js") */
  library?: string;
  /** Detected version string, if any (e.g. "15.2.0") */
  version?: string;
  /** Source URLs and titles cited by the subagent */
  sources: Array<{ url: string; title: string }>;
  /** Synthesized summary — targeted at 1.5–2K tokens */
  summary: string;
  /** Representative code or text snippets with their source labels */
  relevantSnippets: Array<{ content: string; source: string }>;
  /** Confidence signal from the subagent */
  confidenceHint: 'high' | 'medium' | 'low';
  /**
   * Correlation id for outcome attribution (Wave 25 Phase D).
   * Set to the same value as `id` for simplicity — one UUID per research run.
   */
  correlationId: string;
  /** Epoch milliseconds when the artifact was created */
  createdAt: number;
  /** true when the artifact was served from the SQLite cache rather than a live spawn */
  cached: boolean;
}
