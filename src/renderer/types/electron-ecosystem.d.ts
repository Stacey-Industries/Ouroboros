/**
 * electron-ecosystem.d.ts — Wave 37 Phase B ecosystem API types.
 *
 * Push-only channel: ecosystem:promptDiff (class: paired-read, timeout: short).
 */

export interface PromptDiffPayload {
  previousText: string;
  currentText: string;
  linesAdded: number;
  linesRemoved: number;
}

export interface EcosystemAPI {
  /** Subscribe to ecosystem:promptDiff push events. Returns cleanup function. */
  onPromptDiff: (callback: (payload: PromptDiffPayload) => void) => () => void;
}
