/**
 * src/main/telemetry/index.ts — barrel re-exports for the telemetry module.
 *
 * Note: telemetryJsonlMirror was planned (Wave 15 §1) but never instantiated
 * in production; removed in Wave 41 Phase F. Use
 * `sqlite3 telemetry.db 'SELECT ...'` for operator inspection of telemetry
 * events.
 */

export type { OutcomeObserver } from './outcomeObserver';
export {
  closeOutcomeObserver,
  createOutcomeObserver,
  getOutcomeObserver,
  initOutcomeObserver,
} from './outcomeObserver';
export type { TelemetryStore } from './telemetryStore';
export {
  closeTelemetryStore,
  getTelemetryStore,
  initTelemetryStore,
  openTelemetryStore,
} from './telemetryStore';
