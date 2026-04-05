/**
 * qualitySignalTypes.ts — Type definitions for the router quality signal system.
 *
 * Quality signals are implicit behavioral indicators that a routing decision
 * was correct or incorrect. They are written to a separate JSONL file and
 * joined to routing decisions by traceId or sessionId during export.
 */

export type QualitySignalKind =
  | 'user_override' // user changed model after router suggestion (Phase 0)
  | 'user_abort' // user stopped generation mid-stream
  | 'chat_regenerate' // user resent similar prompt in same thread
  | 'chat_correction' // follow-up starts with "actually", "no wait", etc.
  | 'terminal_natural_stop' // Claude Code exited cleanly
  | 'terminal_user_abort' // user Ctrl-C'd the terminal session
  | 'code_committed' // git commit detected within T+5min of session end
  | 'task_completed' // task_completed hook event received
  | 'task_interrupted'; // session ended before task_completed

export interface QualityAnnotation {
  traceId: string | null;
  sessionId: string | null;
  signalKind: QualitySignalKind;
  timestamp: string;
  /** 0–1 normalized: 1 = positive (routing was good), 0 = negative (routing was wrong). */
  value: number;
  meta?: Record<string, unknown>;
}
