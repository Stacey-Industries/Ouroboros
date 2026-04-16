/**
 * ipc-handlers/telemetry.ts — IPC handler registrar for telemetry and
 * observability channels.
 *
 * Channels registered:
 *   telemetry:queryEvents   — paginated event query
 *   telemetry:queryOutcomes — outcomes for a given event
 *   telemetry:queryTraces   — orchestration traces for a session
 *   observability:exportTrace — writes HAR-like JSON to downloads dir
 */

import fs from 'node:fs';
import path from 'node:path';

import { app, ipcMain } from 'electron';

import log from '../logger';
import { getTelemetryStore } from '../telemetry';

// ─── Local types ──────────────────────────────────────────────────────────────

type HandlerOk<T> = { success: true } & T;
type HandlerFail = { success: false; error: string };
type HandlerResult<T> = HandlerOk<T> | HandlerFail;

function ok<T extends object>(data: T): HandlerOk<T> {
  return { success: true, ...data };
}

function fail(err: unknown): HandlerFail {
  return { success: false, error: err instanceof Error ? err.message : String(err) };
}

// ─── Registration helper ──────────────────────────────────────────────────────

function register(
  channels: string[],
  channel: string,
  handler: (...args: unknown[]) => unknown,
): void {
  ipcMain.removeHandler(channel);
  ipcMain.handle(channel, async (_event, ...args: unknown[]) => {
    try {
      return await handler(...args);
    } catch (err) {
      log.error(`[telemetry ipc] ${channel} error:`, err);
      return fail(err);
    }
  });
  channels.push(channel);
}

// ─── Query events ─────────────────────────────────────────────────────────────

interface QueryEventsArgs {
  sessionId?: string;
  type?: string;
  limit?: number;
  offset?: number;
}

function handleQueryEvents(args: unknown): HandlerResult<{ events: unknown[] }> {
  const store = getTelemetryStore();
  if (!store) return ok({ events: [] });
  const { sessionId, type, limit, offset } = (args ?? {}) as QueryEventsArgs;
  const events = store.queryEvents({ sessionId, type, limit, offset });
  return ok({ events });
}

// ─── Query outcomes ───────────────────────────────────────────────────────────

function handleQueryOutcomes(eventId: unknown): HandlerResult<{ outcomes: unknown[] }> {
  const store = getTelemetryStore();
  if (!store || typeof eventId !== 'string' || !eventId) return ok({ outcomes: [] });
  const outcomes = store.queryOutcomes(eventId);
  return ok({ outcomes });
}

// ─── Query traces ─────────────────────────────────────────────────────────────

interface QueryTracesArgs {
  sessionId: string;
  limit?: number;
}

function handleQueryTraces(args: unknown): HandlerResult<{ traces: unknown[] }> {
  const store = getTelemetryStore();
  if (!store) return ok({ traces: [] });
  const { sessionId, limit } = (args ?? {}) as QueryTracesArgs;
  if (typeof sessionId !== 'string' || !sessionId) return ok({ traces: [] });
  const traces = store.queryTraces(sessionId, limit);
  return ok({ traces });
}

// ─── Record UI event ─────────────────────────────────────────────────────────

interface RecordEventArgs {
  kind: string;
  data?: unknown;
}

function handleRecordEvent(args: unknown): HandlerResult<object> {
  const { kind, data } = (args ?? {}) as RecordEventArgs;
  if (typeof kind !== 'string' || !kind) return fail('kind is required');
  const store = getTelemetryStore();
  if (!store) return ok({});
  store.record({
    type: `ui.${kind}`,
    sessionId: 'ui',
    timestamp: Date.now(),
    data: data as Record<string, unknown> | undefined,
  } as unknown as Parameters<typeof store.record>[0]);
  return ok({});
}

// ─── Export trace ─────────────────────────────────────────────────────────────

interface ExportTraceArgs {
  sessionId: string;
  format?: 'har' | 'json';
}

function buildHarPayload(sessionId: string): unknown {
  const store = getTelemetryStore();
  const events = store ? store.queryEvents({ sessionId, limit: 1000 }) : [];
  const traces = store ? store.queryTraces(sessionId, 1000) : [];
  const outcomes = events.flatMap((ev) =>
    store ? store.queryOutcomes(ev.id) : [],
  );
  return {
    _telemetryExport: { version: '1', exportedAt: new Date().toISOString() },
    sessionId,
    events,
    traces,
    outcomes,
  };
}

function handleExportTrace(args: unknown): HandlerResult<{ filePath: string }> {
  const { sessionId, format = 'json' } = (args ?? {}) as ExportTraceArgs;
  if (typeof sessionId !== 'string' || !sessionId) {
    return fail('sessionId is required');
  }
  const payload = buildHarPayload(sessionId);
  const ts = Date.now();
  const fileName = `ouroboros-trace-${sessionId.slice(0, 8)}-${ts}.${format === 'har' ? 'har' : 'json'}`;
   
  const downloadsDir = app.getPath('downloads');
  const filePath = path.join(downloadsDir, fileName);
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- trusted path from app.getPath('downloads')
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf8');
  log.info('[telemetry] exported trace', filePath);
  return ok({ filePath });
}

// ─── Main registration entry point ────────────────────────────────────────────

let registeredChannels: string[] = [];

export function registerTelemetryHandlers(): string[] {
  const channels: string[] = [];
  register(channels, 'telemetry:queryEvents', handleQueryEvents);
  register(channels, 'telemetry:queryOutcomes', handleQueryOutcomes);
  register(channels, 'telemetry:queryTraces', handleQueryTraces);
  register(channels, 'telemetry:record', handleRecordEvent);
  register(channels, 'observability:exportTrace', handleExportTrace);
  registeredChannels = channels;
  return channels;
}

export function cleanupTelemetryHandlers(): void {
  for (const ch of registeredChannels) {
    ipcMain.removeHandler(ch);
  }
  registeredChannels = [];
}
