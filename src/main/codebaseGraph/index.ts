/**
 * codebaseGraph/index.ts -- Barrel export for the codebase graph subsystem.
 */

// ---- Controller (Phase 8) ---------------------------------------------------
export { GraphController, getGraphController } from './graphController'
export type { GraphControllerStatus } from './graphController'

// ---- Database (Phase 1) -----------------------------------------------------
export { GraphDatabase } from './graphDatabase'
export type {
  NodeLabel,
  EdgeType,
  GraphNode,
  GraphEdge,
  NodeFilter,
  NodeSearchResult,
  FileHashRecord,
  ProjectRecord,
  ADRRecord,
  ADRSection,
  BaseNodeProps,
  ProjectProps,
  FileProps,
  FolderProps,
  FunctionProps,
  MethodProps,
  ClassProps,
  InterfaceProps,
  TypeProps,
  EnumProps,
  RouteProps,
  ModuleProps,
  PackageProps,
} from './graphDatabaseTypes'

// ---- Tree-sitter parser (Phase 2) ------------------------------------------
export { TreeSitterParser } from './treeSitterParser'
export type {
  LanguageId,
  LanguageConfig,
  RoutePattern,
  ExtractedDefinition,
  ExtractedImport,
  ImportSpecifier,
  ExtractedCall,
  ExtractedRoute,
  ParsedFileResult,
} from './treeSitterTypes'
export { getLanguageConfig, getSupportedExtensions } from './treeSitterLanguageConfigs'

// ---- Indexing pipeline (Phase 3) --------------------------------------------
export { IndexingPipeline } from './indexingPipeline'
export type {
  IndexingOptions,
  IndexingProgress,
  IndexingResult,
  DiscoveredFile,
  IndexedFile,
} from './indexingPipelineTypes'

// ---- Query engines (Phase 5) ------------------------------------------------
export { QueryEngine } from './queryEngine'
export { CypherEngine } from './cypherEngine'
export type {
  RiskLevel,
  TraceCallPathOptions,
  TraceNode,
  TraceEdge,
  TraceResult,
  ChangeScope,
  DetectChangesOptions,
  ChangedSymbol,
  ImpactedCaller,
  ChangedFileInfo,
  DetectChangesResult,
  ArchitectureAspect,
  ArchitectureResult,
  GraphSchemaResult,
  CodeSearchResult,
  CodeSearchOptions,
} from './queryEngineTypes'

// ---- MCP tool handlers (Phase 6) --------------------------------------------
export { createGraphMcpTools } from './mcpToolHandlers'
export type { GraphToolContext } from './mcpToolHandlers'

// ---- Auto-sync watcher (Phase 7) --------------------------------------------
export { AutoSyncWatcher } from './autoSync'
