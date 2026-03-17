/**
 * contextLayerTypes.ts — Stub type definitions for context layer configuration.
 */

export interface ContextLayerConfig {
  enabled: boolean
  maxModules: number
  maxSizeBytes: number
  debounceMs: number
  autoSummarize: boolean
  /** Max directory depth to descend before absorbing remaining files into one module. Default: 6. */
  moduleDepthLimit: number
}
