/**
 * src/main/telemetry/index.ts — barrel re-exports for the telemetry module.
 *
 * Wave 70 Phase C2 (2026-05-02): the JSONL cold-tier archive is back.
 * `createTelemetryJsonlMirror` was planned for Wave 15, removed in Wave 41
 * Phase F because no production caller existed, and revived here with
 * retention disabled (10-year defensive ceiling) so historical telemetry is
 * preserved indefinitely. SQLite stays the hot tier with the 30-day
 * `purgeRetainedRows` schedule already in place.
 */

export type { OutcomeObserver } from './outcomeObserver';
export {
  closeOutcomeObserver,
  createOutcomeObserver,
  getOutcomeObserver,
  initOutcomeObserver,
} from './outcomeObserver';
export type { TelemetryJsonlMirror } from './telemetryJsonlMirror';
export {
  compressOldFiles as compressTelemetryJsonl,
  createTelemetryJsonlMirror,
  purgeOldFiles as purgeTelemetryJsonl,
} from './telemetryJsonlMirror';
export type { TelemetryStore } from './telemetryStore';
export {
  closeTelemetryStore,
  getTelemetryStore,
  initTelemetryStore,
  openTelemetryStore,
} from './telemetryStore';
