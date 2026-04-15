/**
 * src/main/telemetry/index.ts — barrel re-exports for the telemetry module.
 */

export type { OutcomeObserver } from './outcomeObserver';
export {
  closeOutcomeObserver,
  createOutcomeObserver,
  getOutcomeObserver,
  initOutcomeObserver,
} from './outcomeObserver';
export type { TelemetryJsonlMirror } from './telemetryJsonlMirror';
export { createTelemetryJsonlMirror, purgeOldFiles } from './telemetryJsonlMirror';
export type { TelemetryStore } from './telemetryStore';
export {
  closeTelemetryStore,
  getTelemetryStore,
  initTelemetryStore,
  openTelemetryStore,
} from './telemetryStore';
