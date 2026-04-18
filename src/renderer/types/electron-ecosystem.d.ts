/**
 * electron-ecosystem.d.ts — Wave 37 Phase B+C ecosystem API types.
 *
 * Push-only channel: ecosystem:promptDiff (class: paired-read, timeout: short).
 * Invoke channels (Phase C):
 *   ecosystem:exportUsage    — paired-write, long
 *   ecosystem:lastExportInfo — paired-read,  short
 */

import type { IpcResult } from './electron-foundation';

export interface PromptDiffPayload {
  previousText: string;
  currentText: string;
  linesAdded: number;
  linesRemoved: number;
}

export interface UsageExportOptions {
  windowStart: number;
  windowEnd: number;
  outputPath: string;
}

export interface UsageExportSuccessResult extends IpcResult {
  success: true;
  rowsWritten: number;
  path: string;
}

export interface UsageExportFailResult extends IpcResult {
  success: false;
  error: string;
}

export type UsageExportResult = UsageExportSuccessResult | UsageExportFailResult;

export interface LastExportInfo {
  path: string;
  at: number;
  rows: number;
}

export interface LastExportInfoResult extends IpcResult {
  info?: LastExportInfo | null;
}

export interface EcosystemAPI {
  /** Subscribe to ecosystem:promptDiff push events. Returns cleanup function. */
  onPromptDiff: (callback: (payload: PromptDiffPayload) => void) => () => void;
  /** Export cost-history rows in [windowStart, windowEnd] as JSONL to outputPath. */
  exportUsage: (opts: UsageExportOptions) => Promise<UsageExportResult>;
  /** Return metadata about the most recent successful export (null if none). */
  lastExportInfo: () => Promise<LastExportInfoResult>;
}
