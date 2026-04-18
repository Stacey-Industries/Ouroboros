/**
 * usageExporterHandlers.ts — Wave 37 Phase C
 *
 * IPC handlers for the generic JSONL usage exporter.
 *
 * Channels:
 *   ecosystem:exportUsage     — write windowed cost history to a JSONL file
 *   ecosystem:lastExportInfo  — retrieve last-export metadata from config
 *
 * Channel catalog:
 *   ecosystem:exportUsage    → paired-write, long
 *   ecosystem:lastExportInfo → paired-read,  short
 */

import { ipcMain } from 'electron';

import { getConfigValue, setConfigValue } from '../config';
import log from '../logger';
import type { UsageExportOptions } from '../usageExporter';
import { exportUsage } from '../usageExporter';

// ─── Types ───────────────────────────────────────────────────────────────────

interface LastExportInfo {
  path: string;
  at: number;
  rows: number;
}

type ExportSuccessResult = { success: true; rowsWritten: number; path: string };
type ExportFailResult   = { success: false; error: string };
type ExportResult       = ExportSuccessResult | ExportFailResult;

type LastExportResult =
  | { success: true; info: LastExportInfo | null }
  | { success: false; error: string };

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getLastExportInfo(): LastExportInfo | null {
  const raw = getConfigValue('ecosystem') as Record<string, unknown> | undefined;
  const info = raw?.lastExport as LastExportInfo | undefined;
  if (!info?.path || typeof info.at !== 'number') return null;
  return info;
}

function persistLastExport(info: LastExportInfo): void {
  const current = (getConfigValue('ecosystem') as Record<string, unknown>) ?? {};
  setConfigValue('ecosystem', { ...current, lastExport: info });
}

// ─── Registration ────────────────────────────────────────────────────────────

export function registerUsageExporterHandlers(): string[] {
  const channels: string[] = [];

  ipcMain.handle(
    'ecosystem:exportUsage',
    async (_event, opts: UsageExportOptions): Promise<ExportResult> => {
      try {
        const result = await exportUsage(opts);
        const info: LastExportInfo = {
          path: result.path,
          at: Date.now(),
          rows: result.rowsWritten,
        };
        persistLastExport(info);
        log.info('[usageExporter] exported', result.rowsWritten, 'rows');
        return { success: true, rowsWritten: result.rowsWritten, path: result.path };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        log.warn('[usageExporter] export failed:', message);
        return { success: false, error: message };
      }
    },
  );
  channels.push('ecosystem:exportUsage');

  ipcMain.handle('ecosystem:lastExportInfo', async (): Promise<LastExportResult> => {
    try {
      return { success: true, info: getLastExportInfo() };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  });
  channels.push('ecosystem:lastExportInfo');

  return channels;
}
