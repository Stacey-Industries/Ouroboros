/**
 * subagentLinkTrace.ts — Structured trace helpers for subagent linkage diagnostics.
 *
 * All trace emission is gated on the `agentMonitor.subagentDisplay.diagnostics`
 * config flag (default false). No behaviour changes — observation only.
 *
 * Wave 57 Phase A.
 */

import { getConfigValue } from '../config';
import log from '../logger';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TraceLinkPayload {
  parentSessionId?: string;
  childSessionId?: string;
  toolCallId?: string;
  source: string;
  timestamp: number;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function isDiagnosticsEnabled(): boolean {
  const monitor = getConfigValue('agentMonitor');
  return monitor?.subagentDisplay?.diagnostics === true;
}

function buildLogEntry(stage: string, payload: TraceLinkPayload): Record<string, unknown> {
  const entry: Record<string, unknown> = {
    stage,
    source: payload.source,
    timestamp: payload.timestamp,
  };
  if (payload.parentSessionId !== undefined) entry.parentSessionId = payload.parentSessionId;
  if (payload.childSessionId !== undefined) entry.childSessionId = payload.childSessionId;
  if (payload.toolCallId !== undefined) entry.toolCallId = payload.toolCallId;
  return entry;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Emit a structured trace entry when diagnostics are enabled.
 * No-op when `agentMonitor.subagentDisplay.diagnostics` is false (the default).
 */
export function traceLink(stage: string, payload: TraceLinkPayload): void {
  if (!isDiagnosticsEnabled()) return;
  const entry = buildLogEntry(stage, payload);
  log.info('[trace:subagent-link]', entry);
}
