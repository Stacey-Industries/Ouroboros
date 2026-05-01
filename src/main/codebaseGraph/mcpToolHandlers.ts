/**
 * mcpToolHandlers.ts -- MCP tool definitions for the codebase knowledge graph.
 *
 * Exports a `createGraphMcpTools(context)` function that returns 14 McpToolDefinition
 * objects replicating the codebase-memory-mcp API. Each handler returns formatted
 * plain text (not JSON), includes qualified names and file:line locations, and
 * truncates output at ~8000 chars.
 */

import type { McpToolDefinition } from '../internalMcp/internalMcpTypes';
import type { GraphToolContext } from './graphTypes';
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
} from './mcpToolHandlerDefs';
import {
  formatQueryResult,
  handleDetectChanges,
  handleManageAdr,
  handleSearchGraph,
  handleTraceCallPath,
} from './mcpToolHandlerHelpers';

export type { GraphToolContext };

// ---- Tool schema definitions --------------------------------------------------

const TOOL_SCHEMAS = {
  index_repository: {
    type: 'object',
    properties: {
      repo_path: {
        type: 'string',
        description: 'Absolute path to the repository root. Defaults to the current workspace.',
      },
    },
    required: [],
  },
  list_projects: { type: 'object', properties: {}, required: [] },
  delete_project: {
    type: 'object',
    properties: { project_name: { type: 'string', description: 'Name of the project to delete.' } },
    required: ['project_name'],
  },
  index_status: {
    type: 'object',
    properties: {
      project: { type: 'string', description: 'Project name. Defaults to current workspace.' },
    },
    required: [],
  },
  search_graph: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Symbol name to search (preferred). Substring match.' },
      name_pattern: { type: 'string', description: 'Deprecated alias for query.' },
      label: { type: 'string' },
      project: { type: 'string' },
      file_pattern: { type: 'string' },
      relationship: { type: 'string' },
      direction: { type: 'string', enum: ['inbound', 'outbound', 'both'] },
      min_degree: { type: 'number' },
      max_degree: { type: 'number' },
      exclude_entry_points: { type: 'boolean' },
      case_sensitive: { type: 'boolean' },
      limit: { type: 'number' },
      offset: { type: 'number' },
    },
    required: [],
  },
  get_graph_schema: { type: 'object', properties: {}, required: [] },
  get_architecture: {
    type: 'object',
    properties: {
      aspects: {
        type: 'array',
        items: { type: 'string' },
        description: 'Which aspects to include. Default: ["all"]',
      },
      project: { type: 'string' },
    },
    required: [],
  },
  search_code: {
    type: 'object',
    properties: {
      pattern: { type: 'string' },
      file_pattern: { type: 'string' },
      regex: { type: 'boolean' },
      case_sensitive: { type: 'boolean' },
      max_results: { type: 'number' },
      offset: { type: 'number' },
    },
    required: ['pattern'],
  },
  get_code_snippet: {
    type: 'object',
    properties: {
      symbol: { type: 'string', description: 'Symbol name or qualified name (preferred).' },
      qualified_name: { type: 'string', description: 'Deprecated alias for symbol.' },
    },
    required: [],
  },
  trace_call_path: {
    type: 'object',
    properties: {
      symbol: { type: 'string', description: 'Function/method name to trace (preferred).' },
      function_name: { type: 'string', description: 'Deprecated alias for symbol.' },
      direction: {
        type: 'string',
        enum: ['inbound', 'outbound', 'both', 'callers', 'callees'],
        description:
          "Direction: 'inbound'/'callers' (who calls this); 'outbound'/'callees' (what this calls); 'both' (default).",
      },
      depth: { type: 'number' },
      risk_labels: { type: 'boolean' },
    },
    required: [],
  },
  detect_changes: {
    type: 'object',
    properties: {
      scope: { type: 'string', enum: ['unstaged', 'staged', 'all', 'branch'] },
      base_branch: { type: 'string' },
      depth: { type: 'number' },
    },
    required: [],
  },
  query_graph: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
  manage_adr: {
    type: 'object',
    properties: {
      mode: { type: 'string', enum: ['list', 'get', 'store', 'update', 'delete'] },
      project: { type: 'string' },
      id: { type: 'string', description: 'ADR identifier (when targeting a specific ADR).' },
      adr_id: { type: 'string', description: 'Deprecated alias for id.' },
      content: { type: 'string' },
      sections: { type: 'object' },
    },
    required: ['mode'],
  },
  ingest_traces: {
    type: 'object',
    properties: {
      traces: { type: 'string', description: 'JSON-serialized string: JSON.stringify([{ fromId, toId, type, weight? }])' },
    },
    required: ['traces'],
  },
} as const;

// ---- Factory helpers ----------------------------------------------------------

function buildLifecycleTools(context: GraphToolContext): McpToolDefinition[] {
  return [
    {
      name: 'index_repository',
      description: 'Index a repository into the codebase knowledge graph.',
      inputSchema: TOOL_SCHEMAS.index_repository,
      handler: async (a: Record<string, unknown>) => handleIndexRepository(a, context),
    },
    {
      name: 'list_projects',
      description: 'List all indexed projects with node/edge counts and last index time.',
      inputSchema: TOOL_SCHEMAS.list_projects,
      handler: async () => handleListProjects(context),
    },
    {
      name: 'delete_project',
      description: 'Remove a project and all its graph data. Irreversible.',
      inputSchema: TOOL_SCHEMAS.delete_project,
      handler: async (a: Record<string, unknown>) => handleDeleteProject(a, context),
    },
    {
      name: 'index_status',
      description:
        'Get the current indexing status for a project. Reports node/edge counts by label/type. Includes a parseAnomalies count when files were processed but produced no definitions (signal for indexer regressions). Pass project name or omit to use the current workspace.',
      inputSchema: TOOL_SCHEMAS.index_status,
      handler: async (a: Record<string, unknown>) => handleIndexStatus(a, context),
    },
  ];
}

function buildMetaTools(context: GraphToolContext): McpToolDefinition[] {
  return [
    {
      name: 'get_graph_schema',
      description:
        'Graph schema: node/edge counts, relationship patterns, sample names. Call this once at the start of a session involving graph queries to discover what node labels and edge types are available before writing query_graph (Cypher) statements.',
      inputSchema: TOOL_SCHEMAS.get_graph_schema,
      handler: async () => handleGetGraphSchema(context),
    },
    {
      name: 'ingest_traces',
      description:
        'Add/strengthen HTTP_CALLS edges. Pass traces as a JSON-serialized string: JSON.stringify([{ fromId, toId, type, weight? }]).',
      inputSchema: TOOL_SCHEMAS.ingest_traces,
      handler: async (a: Record<string, unknown>) => handleIngestTraces(a, context),
    },
  ];
}

function buildSearchTools(context: GraphToolContext): McpToolDefinition[] {
  return [
    {
      name: 'search_graph',
      description:
        'Symbol search (prefer over Grep). Returns graph nodes with file:line + metadata. Grep returns text matches including comments; search_graph returns actual definitions. Pass query or name_pattern (deprecated).',
      inputSchema: TOOL_SCHEMAS.search_graph,
      handler: async (a: Record<string, unknown>) => {
        try {
          return await handleSearchGraph(a, context);
        } catch (err) {
          return `Error searching graph: ${err instanceof Error ? err.message : String(err)}`;
        }
      },
    },
    {
      name: 'get_architecture',
      description:
        'Use when orienting in unfamiliar code or before a refactor. Returns hotspots (most-connected functions), module structure, and file-tree overview. Cheaper than reading multiple files; tells you where a change has the widest impact.',
      inputSchema: TOOL_SCHEMAS.get_architecture,
      handler: async (a: Record<string, unknown>) => handleGetArchitecture(a, context),
    },
    {
      name: 'search_code',
      description:
        'Regex search across source files. Use for STRING content (error messages, log lines, literal text). For SYMBOL queries (function/class names) prefer search_graph — it filters out comments and same-name false positives.',
      inputSchema: TOOL_SCHEMAS.search_code,
      handler: async (a: Record<string, unknown>) => handleSearchCode(a, context),
    },
    {
      name: 'get_code_snippet',
      description:
        'Symbol body retrieval (prefer over Read for single symbols). Returns source for function/class. Pass symbol or qualified_name (deprecated). Auto-resolves bare names if unique.',
      inputSchema: TOOL_SCHEMAS.get_code_snippet,
      handler: async (a: Record<string, unknown>) => handleGetCodeSnippet(a, context),
    },
  ];
}

function buildTraceAndChangeTools(context: GraphToolContext): McpToolDefinition[] {
  const { queryEngine } = context;
  return [
    {
      name: 'trace_call_path',
      description:
        "Caller/callee graph (prefer over Grep). Pass symbol or function_name (deprecated). direction: 'inbound'/'callers', 'outbound'/'callees', 'both' (default). Returns call edges with risk labels.",
      inputSchema: TOOL_SCHEMAS.trace_call_path,
      handler: async (a: Record<string, unknown>) => {
        try {
          return await handleTraceCallPath(a, queryEngine);
        } catch (err) {
          return `Error tracing call path: ${err instanceof Error ? err.message : String(err)}`;
        }
      },
    },
    {
      name: 'detect_changes',
      description:
        'Pre-refactor impact analysis. Maps git changes to affected symbols; computes blast radius of what will break.',
      inputSchema: TOOL_SCHEMAS.detect_changes,
      handler: async (a: Record<string, unknown>) => {
        try {
          return await handleDetectChanges(a, queryEngine);
        } catch (err) {
          return `Error detecting changes: ${err instanceof Error ? err.message : String(err)}`;
        }
      },
    },
  ];
}

function buildCypherAndAdrTools(context: GraphToolContext): McpToolDefinition[] {
  const { cypherEngine } = context;
  return [
    {
      name: 'query_graph',
      description:
        'Complex relationship queries. Cypher-subset: MATCH (n:Label), (a)-[:TYPE]->(b), (a)-[:TYPE*1..3]->(b); WHERE n.prop {=,<>,<,>,<=,>=,CONTAINS,STARTS WITH,ENDS WITH} AND/OR; RETURN n.prop, COUNT(*), labels(n), DISTINCT; ORDER BY, LIMIT. Capped at 200 rows. Use search_graph for simple symbol lookups. Call get_graph_schema first to discover node labels and edge types.',
      inputSchema: TOOL_SCHEMAS.query_graph,
      handler: async (a: Record<string, unknown>) => {
        try {
          return formatQueryResult(cypherEngine.execute(a.query as string));
        } catch (err) {
          return `Query error: ${err instanceof Error ? err.message : String(err)}`;
        }
      },
    },
    {
      name: 'manage_adr',
      description: 'Manage Architecture Decision Records (ADR). Modes: list, get, store, update, delete.',
      inputSchema: TOOL_SCHEMAS.manage_adr,
      handler: async (a: Record<string, unknown>) => {
        try {
          return await handleManageAdr(a, context);
        } catch (err) {
          return `Error managing ADR: ${err instanceof Error ? err.message : String(err)}`;
        }
      },
    },
  ];
}
export function createGraphMcpTools(context: GraphToolContext): McpToolDefinition[] {
  return [
    ...buildLifecycleTools(context),
    ...buildMetaTools(context),
    ...buildSearchTools(context),
    ...buildTraceAndChangeTools(context),
    ...buildCypherAndAdrTools(context),
  ];
}