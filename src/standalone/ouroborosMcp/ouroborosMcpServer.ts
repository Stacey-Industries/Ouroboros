/**
 * ouroborosMcpServer.ts — Build the MCP server with read-only graph tools.
 *
 * Phase A scope: register a minimal direct-query handler set that talks to
 * better-sqlite3 directly. The plan originally called for reusing
 * `createGraphMcpTools` from `src/main/codebaseGraph/mcpToolHandlers.ts`,
 * but Phase A discovered that file's transitive import chain pulls in
 * Electron via `queryEngineSupport.ts → ipc-handlers/gitOperations →
 * app.getPath`. So Phase A ships two direct-query handlers
 * (`get_graph_schema`, `search_graph`) — enough to prove the standalone
 * architecture end-to-end. Phase B's job is to refactor the IDE-side
 * handler chain to be Electron-portable, then plug the full 14-tool
 * surface in here.
 *
 * The exclusion-set + filter helper are kept exported so Phase B's reuse
 * path lands cleanly.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import Database from 'better-sqlite3';

import type { McpToolDefinition } from '../../main/internalMcp/internalMcpTypes';

/**
 * Mutating tools — excluded when (in Phase B) we plug in the full IDE
 * handler set. `index_repository` and `delete_project` write to the DB;
 * `ingest_traces` mutates edge weights. The IDE owns these.
 */
export const READ_ONLY_EXCLUDED: ReadonlySet<string> = new Set([
  'index_repository',
  'delete_project',
  'ingest_traces',
]);

export function filterReadOnlyTools(
  tools: ReadonlyArray<McpToolDefinition>,
): McpToolDefinition[] {
  return tools.filter((t) => !READ_ONLY_EXCLUDED.has(t.name));
}

export interface BuildServerInput {
  dbPath: string;
}

export interface BuiltServer {
  server: Server;
  toolNames: string[];
  close: () => void;
}

export function buildOuroborosMcpServer(input: BuildServerInput): BuiltServer {
  const db = new Database(input.dbPath, { readonly: true, fileMustExist: true });
  const tools = buildPhaseATools(db);
  const server = registerHandlers(tools);
  return {
    server,
    toolNames: tools.map((t) => t.name),
    close: () => db.close(),
  };
}

function buildPhaseATools(db: Database.Database): McpToolDefinition[] {
  return [
    {
      name: 'get_graph_schema',
      description:
        'Graph schema: node-label counts, edge-type counts. Call once at the start of a session before search/query operations.',
      inputSchema: { type: 'object', properties: {}, required: [] },
      handler: async () => formatSchema(db),
    },
    {
      name: 'search_graph',
      description:
        'USE INSTEAD OF Grep when looking for symbols by name. Returns indexed nodes with file:line. Filter by `label` (Function, Class, etc.) and `name_pattern` (substring match).',
      inputSchema: {
        type: 'object',
        properties: {
          name_pattern: { type: 'string' },
          label: { type: 'string' },
          limit: { type: 'number' },
        },
        required: [],
      },
      handler: async (args) => formatSearch(db, args),
    },
  ];
}

function formatSchema(db: Database.Database): string {
  const labels = db
    .prepare('SELECT label, COUNT(*) as c FROM nodes GROUP BY label ORDER BY c DESC')
    .all() as Array<{ label: string; c: number }>;
  const edges = db
    .prepare('SELECT type, COUNT(*) as c FROM edges GROUP BY type ORDER BY c DESC')
    .all() as Array<{ type: string; c: number }>;
  return JSON.stringify(
    {
      nodeLabelCounts: Object.fromEntries(labels.map((r) => [r.label, r.c])),
      edgeTypeCounts: Object.fromEntries(edges.map((r) => [r.type, r.c])),
    },
    null,
    2,
  );
}

function formatSearch(db: Database.Database, args: Record<string, unknown>): string {
  const limit = clampLimit(args.limit);
  const namePattern = typeof args.name_pattern === 'string' ? args.name_pattern : null;
  const label = typeof args.label === 'string' ? args.label : null;
  const where: string[] = [];
  const params: Record<string, unknown> = { limit };
  if (namePattern) {
    where.push("name LIKE @pattern");
    params.pattern = `%${namePattern}%`;
  }
  if (label) {
    where.push('label = @label');
    params.label = label;
  }
  const sql = `SELECT name, label, file_path, start_line FROM nodes${where.length ? ' WHERE ' + where.join(' AND ') : ''} LIMIT @limit`;
  const rows = db.prepare(sql).all(params);
  return JSON.stringify({ results: rows, limit }, null, 2);
}

function clampLimit(raw: unknown): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return 20;
  return Math.max(1, Math.min(100, Math.floor(raw)));
}

function registerHandlers(tools: McpToolDefinition[]): Server {
  const server = new Server(
    { name: 'ouroboros', version: '1.0.0' },
    { capabilities: { tools: {} } },
  );
  const byName = new Map(tools.map((t) => [t.name, t]));

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: tools.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema as Record<string, unknown>,
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const tool = byName.get(req.params.name);
    if (!tool) {
      return {
        content: [{ type: 'text', text: `Unknown tool: ${req.params.name}` }],
        isError: true,
      };
    }
    const args = (req.params.arguments ?? {}) as Record<string, unknown>;
    const text = await tool.handler(args, '');
    return { content: [{ type: 'text', text }], isError: false };
  });
  return server;
}
