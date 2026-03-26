/**
 * contextLayerTypes.ts — Type definitions for the context layer subsystem.
 */

export interface ContextLayerConfig {
  enabled: boolean
  maxModules: number
  maxSizeBytes: number
  debounceMs: number
  autoSummarize: boolean
  /** Max directory depth to descend before absorbing remaining files into one module. Default: 6. */
  moduleDepthLimit?: number
}

// ---------------------------------------------------------------------------
// Module identity and structural summary
// ---------------------------------------------------------------------------

/** Pattern used to detect a module boundary. */
export type ModulePattern = 'feature-folder' | 'config' | 'flat-group' | 'single-file'

/** Lightweight descriptor identifying a module in the repo. */
export interface ModuleIdentity {
  /** Stable kebab-case identifier (e.g. 'file-viewer', 'agent-chat'). */
  id: string
  /** Human-readable label (e.g. 'File Viewer', 'Agent Chat'). */
  label: string
  /** Relative path to the module's root directory. */
  rootPath: string
  /** How the module boundary was detected. */
  pattern: ModulePattern
}

/** A single extracted symbol from module source code. */
export interface ExtractedSymbol {
  name: string
  kind: 'function' | 'class' | 'interface' | 'type' | 'variable' | 'other'
  signature?: string
  moduleId?: string
}

/** Structural analysis of a module — derived from the repo index without AI. */
export interface ModuleStructuralSummary {
  module: ModuleIdentity
  fileCount: number
  totalLines: number
  languages: string[]
  exports: string[]
  imports: string[]
  entryPoints: string[]
  recentlyChanged: boolean
  lastModified: number
  contentHash: string
  /** Symbols extracted from the module's source code (optional, populated during summarization). */
  extractedSymbols?: ExtractedSymbol[]
}

/** AI-generated natural-language description of a module. */
export interface ModuleAISummary {
  description: string
  keyResponsibilities: string[]
  gotchas: string[]
  /** When the AI summary was generated (Unix ms). */
  generatedAt: number
  /** Content hash of the module files at the time of generation — used to detect staleness. */
  generatedFrom?: string
  /** Estimated token count for this summary. */
  tokenCount?: number
}

/** Persisted entry for a single module in the context layer store. */
export interface ModuleContextEntry {
  structural: ModuleStructuralSummary
  ai?: ModuleAISummary
}

// ---------------------------------------------------------------------------
// Repo map
// ---------------------------------------------------------------------------

/** Full repo map — persisted to .context/repo-map.json. */
export interface RepoMap {
  /** Schema version number (currently 1). */
  version?: number
  /** Unix ms timestamp when the repo map was generated. */
  generatedAt?: number
  /** Workspace root path this repo map was built from. */
  workspaceRoot?: string
  projectName: string
  languages: string[]
  frameworks: string[]
  moduleCount: number
  totalFileCount: number
  modules: ModuleContextEntry[]
  crossModuleDependencies: Array<{ from: string; to: string; weight: number }>
}

// Re-export from orchestration shared types so contextLayer consumers can
// import from one place without creating circular dependencies.
export type { ModuleContextSummary, RepoMapSummary } from '../orchestration/types'

// ---------------------------------------------------------------------------
// Manifest
// ---------------------------------------------------------------------------

/** Manifest tracking context layer state for a workspace. */
export interface ContextLayerManifest {
  version: number
  lastFullRebuild: number
  lastIncrementalUpdate: number
  repoMapHash: string
  moduleHashes: Record<string, string>
  totalSizeBytes: number
}

// ---------------------------------------------------------------------------
// Invalidation events
// ---------------------------------------------------------------------------

/** Event type indicating which modules need refreshing. */
export interface ContextInvalidationEvent {
  type: 'file_changed' | 'git_commit' | 'session_start' | 'manual'
  affectedModules: string[]
  timestamp: number
}
