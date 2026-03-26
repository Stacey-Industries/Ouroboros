/**
 * mcpToolHandlers.ts -- MCP tool definitions for the codebase knowledge graph.
 *
 * Exports a `createGraphMcpTools(context)` function that returns 14 McpToolDefinition
 * objects replicating the codebase-memory-mcp API. Each handler returns formatted
 * plain text (not JSON), includes qualified names and file:line locations, and
 * truncates output at ~8000 chars.
 */

import type { McpToolDefinition } from '../internalMcp/internalMcpTypes'
import type { CypherEngine } from './cypherEngine'
import type { GraphDatabase } from './graphDatabase'
import type { IndexingPipeline } from './indexingPipeline'
import {
  handleDeleteProject,
  handleGetArchitecture,
  handleGetCodeSnippet,
  handleGetGraphSchema,
  handleIndexRepository,
  handleIndexStatus,
  handleIngestTraces,
  handleListProjects,
  handleSearchCode,
} from './mcpToolHandlerDefs'
import {
  formatQueryResult,
  handleDetectChanges,
  handleManageAdr,
  handleSearchGraph,
  handleTraceCallPath,
} from './mcpToolHandlerHelpers'
import type { QueryEngine } from './queryEngine'

// ---- Context type -------------------------------------------------------------

export interface GraphToolContext {
  db: GraphDatabase
  queryEngine: QueryEngine
  cypherEngine: CypherEngine
  pipeline: IndexingPipeline
  projectName: string
  projectRoot: string
}

// ---- Tool schema definitions --------------------------------------------------

const TOOL_SCHEMAS = {
  index_repository: { type: 'object', properties: { repo_path: { type: 'string', description: 'Absolute path to the repository root. Defaults to the current workspace.' } }, required: [] },
  list_projects: { type: 'object', properties: {}, required: [] },
  delete_project: { type: 'object', properties: { project_name: { type: 'string', description: 'Name of the project to delete.' } }, required: ['project_name'] },
  index_status: { type: 'object', properties: { project: { type: 'string', description: 'Project name. Defaults to current workspace.' } }, required: [] },
  search_graph: { type: 'object', properties: { label: { type: 'string' }, name_pattern: { type: 'string' }, project: { type: 'string' }, file_pattern: { type: 'string' }, relationship: { type: 'string' }, direction: { type: 'string', enum: ['inbound', 'outbound', 'both'] }, min_degree: { type: 'number' }, max_degree: { type: 'number' }, exclude_entry_points: { type: 'boolean' }, case_sensitive: { type: 'boolean' }, limit: { type: 'number' }, offset: { type: 'number' } }, required: [] },
  get_graph_schema: { type: 'object', properties: {}, required: [] },
  get_architecture: { type: 'object', properties: { aspects: { type: 'array', items: { type: 'string' }, description: 'Which aspects to include. Default: ["all"]' }, project: { type: 'string' } }, required: [] },
  search_code: { type: 'object', properties: { pattern: { type: 'string' }, file_pattern: { type: 'string' }, regex: { type: 'boolean' }, case_sensitive: { type: 'boolean' }, max_results: { type: 'number' }, offset: { type: 'number' } }, required: ['pattern'] },
  get_code_snippet: { type: 'object', properties: { qualified_name: { type: 'string', description: 'The full qualified name' } }, required: ['qualified_name'] },
  trace_call_path: { type: 'object', properties: { function_name: { type: 'string' }, direction: { type: 'string', enum: ['inbound', 'outbound', 'both'] }, depth: { type: 'number' }, risk_labels: { type: 'boolean' } }, required: ['function_name'] },
  detect_changes: { type: 'object', properties: { scope: { type: 'string', enum: ['unstaged', 'staged', 'all', 'branch'] }, base_branch: { type: 'string' }, depth: { type: 'number' } }, required: [] },
  query_graph: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
  manage_adr: { type: 'object', properties: { mode: { type: 'string', enum: ['get', 'store', 'update', 'delete'] }, project: { type: 'string' }, content: { type: 'string' }, sections: { type: 'object' } }, required: ['mode'] },
  ingest_traces: { type: 'object', properties: { traces: { type: 'string' } }, required: ['traces'] },
} as const

// ---- Factory ------------------------------------------------------------------

export function createGraphMcpTools(context: GraphToolContext): McpToolDefinition[] {
  const { queryEngine, cypherEngine } = context

  return [
    { name: 'index_repository', description: 'Index a repository into the codebase knowledge graph.', inputSchema: TOOL_SCHEMAS.index_repository, handler: async (args: Record<string, unknown>) => handleIndexRepository(args, context) },
    { name: 'list_projects', description: 'List all indexed projects with node/edge counts and last index time.', inputSchema: TOOL_SCHEMAS.list_projects, handler: async () => handleListProjects(context) },
    { name: 'delete_project', description: 'Remove a project and all its graph data. Irreversible.', inputSchema: TOOL_SCHEMAS.delete_project, handler: async (args: Record<string, unknown>) => handleDeleteProject(args, context) },
    { name: 'index_status', description: 'Get the current indexing status for a project.', inputSchema: TOOL_SCHEMAS.index_status, handler: async (args: Record<string, unknown>) => handleIndexStatus(args, context) },
    { name: 'search_graph', description: 'Search the codebase knowledge graph for nodes by label, name pattern, file path, and more.', inputSchema: TOOL_SCHEMAS.search_graph, handler: async (args: Record<string, unknown>) => { try { return await handleSearchGraph(args, context) } catch (err) { return `Error searching graph: ${err instanceof Error ? err.message : String(err)}` } } },
    { name: 'get_graph_schema', description: 'Get the graph schema: node label counts, edge type counts, relationship patterns, and sample names.', inputSchema: TOOL_SCHEMAS.get_graph_schema, handler: async () => handleGetGraphSchema(context) },
    { name: 'get_architecture', description: 'Get a high-level architectural overview of the codebase.', inputSchema: TOOL_SCHEMAS.get_architecture, handler: async (args: Record<string, unknown>) => handleGetArchitecture(args, context) },
    { name: 'search_code', description: 'Search for text patterns in source files. Supports regex and file pattern filtering.', inputSchema: TOOL_SCHEMAS.search_code, handler: async (args: Record<string, unknown>) => handleSearchCode(args, context) },
    { name: 'get_code_snippet', description: 'Get the source code for a function, class, or other symbol by its qualified name.', inputSchema: TOOL_SCHEMAS.get_code_snippet, handler: async (args: Record<string, unknown>) => handleGetCodeSnippet(args, context) },
    { name: 'trace_call_path', description: 'Trace the call graph from/to a function. Shows callers, callees, or both with risk classification.', inputSchema: TOOL_SCHEMAS.trace_call_path, handler: async (args: Record<string, unknown>) => { try { return await handleTraceCallPath(args, queryEngine) } catch (err) { return `Error tracing call path: ${err instanceof Error ? err.message : String(err)}` } } },
    { name: 'detect_changes', description: 'Map uncommitted git changes to affected graph symbols and compute blast radius.', inputSchema: TOOL_SCHEMAS.detect_changes, handler: async (args: Record<string, unknown>) => { try { return await handleDetectChanges(args, queryEngine) } catch (err) { return `Error detecting changes: ${err instanceof Error ? err.message : String(err)}` } } },
    { name: 'query_graph', description: 'Execute a Cypher-like query against the codebase graph. Read-only, results capped at 200 rows.', inputSchema: TOOL_SCHEMAS.query_graph, handler: async (args: Record<string, unknown>) => { try { return formatQueryResult(cypherEngine.execute(args.query as string)) } catch (err) { return `Query error: ${err instanceof Error ? err.message : String(err)}` } } },
    { name: 'manage_adr', description: 'Manage Architecture Decision Records (ADR). Modes: get, store, update, delete.', inputSchema: TOOL_SCHEMAS.manage_adr, handler: async (args: Record<string, unknown>) => { try { return await handleManageAdr(args, context) } catch (err) { return `Error managing ADR: ${err instanceof Error ? err.message : String(err)}` } } },
    { name: 'ingest_traces', description: 'Ingest OpenTelemetry traces to validate/strengthen HTTP_CALLS edges. (Stub)', inputSchema: TOOL_SCHEMAS.ingest_traces, handler: async (args: Record<string, unknown>) => handleIngestTraces(args) },
  ]
}
