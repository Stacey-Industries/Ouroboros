/**
 * electron-system2.d.ts — IPC types for System 2 index-progress events.
 *
 * These are the shapes sent over `system2:indexProgress` from main → renderer.
 * The discriminated union covers all lifecycle states of a background initial index.
 */

export type System2IndexProgressEvent =
  | {
      kind: 'start'
      projectName: string
      projectRoot: string
      reason: 'first-launch' | 'hash-mismatch' | 'post-gc'
    }
  | {
      kind: 'progress'
      projectName: string
      phase: string
      filesProcessed: number
      filesTotal: number
      elapsedMs: number
    }
  | {
      kind: 'complete'
      projectName: string
      filesIndexed: number
      nodesCreated: number
      durationMs: number
    }
  | {
      kind: 'error'
      projectName: string
      message: string
    }

export interface System2API {
  onIndexProgress: (
    callback: (event: System2IndexProgressEvent) => void,
  ) => () => void
}
