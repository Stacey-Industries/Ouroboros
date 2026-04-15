/**
 * electron-telemetry.d.ts — IPC type contract for telemetry and observability
 * channels (Wave 15 Phase D).
 *
 * Shapes mirror src/main/telemetry/telemetryStoreHelpers.ts. Keep in sync.
 */

// ─── Row types (mirrors telemetryStoreHelpers.ts) ─────────────────────────────

export interface TelemetryEvent {
  id: string;
  type: string;
  sessionId: string;
  correlationId: string;
  timestamp: number;
  payload: unknown;
}

export interface OutcomeRow {
  eventId: string;
  kind: string;
  exitCode: number | null;
  durationMs: number | null;
  stderrHash: string | null;
  signals: unknown;
  confidence: string;
}

export interface TraceRow {
  id: string;
  traceId: string;
  sessionId: string;
  phase: string;
  timestamp: number;
  payload: unknown;
}

// ─── Query options ────────────────────────────────────────────────────────────

export interface QueryEventsOptions {
  sessionId?: string;
  type?: string;
  limit?: number;
  offset?: number;
}

// ─── IPC result wrappers ──────────────────────────────────────────────────────

export interface QueryEventsResult {
  success: boolean;
  error?: string;
  events?: TelemetryEvent[];
}

export interface QueryOutcomesResult {
  success: boolean;
  error?: string;
  outcomes?: OutcomeRow[];
}

export interface QueryTracesResult {
  success: boolean;
  error?: string;
  traces?: TraceRow[];
}

export interface ExportTraceResult {
  success: boolean;
  error?: string;
  filePath?: string;
}

// ─── API interfaces ───────────────────────────────────────────────────────────

export interface TelemetryAPI {
  queryEvents(opts: QueryEventsOptions): Promise<QueryEventsResult>;
  queryOutcomes(eventId: string): Promise<QueryOutcomesResult>;
  queryTraces(opts: { sessionId: string; limit?: number }): Promise<QueryTracesResult>;
  /** Record a free-form UI telemetry event (e.g. preference changes). */
  record(opts: { kind: string; data?: unknown }): Promise<{ success: boolean; error?: string }>;
}

export interface ObservabilityAPI {
  exportTrace(opts: { sessionId: string; format?: 'har' | 'json' }): Promise<ExportTraceResult>;
}
