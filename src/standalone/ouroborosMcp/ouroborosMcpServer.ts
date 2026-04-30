/**
 * ouroborosMcpServer.ts — Build the MCP server with read-only graph tools.
 *
 * Phase B (Wave 60): plugs in the IDE's full `createGraphMcpTools` surface.
 * Phase A had to ship a direct-query stub because `queryEngineSupport.ts`
 * transitively pulled Electron via `ipc-handlers/gitOperations`. Phase B
 * extracted `gitExec` to `src/main/util/gitExec.ts` (no IDE deps), so the
 * tool handler chain is now Electron-clean and reusable here.
 *
 * The result is the full 14-tool surface, minus the 3 mutating tools the
 * IDE owns (`index_repository`, `delete_project`, `ingest_traces`).
 */

import path from 'node:path';

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { CypherEngine } from '../../main/codebaseGraph/cypherEngine';
import { GraphDatabase } from '../../main/codebaseGraph/graphDatabase';
import { createGraphMcpTools } from '../../main/codebaseGraph/mcpToolHandlers';
import { QueryEngine } from '../../main/codebaseGraph/queryEngine';
import type { McpToolDefinition } from '../../main/internalMcp/internalMcpTypes';

/**
 * Mutating tools — excluded from the read-only standalone surface.
 * `index_repository` and `delete_project` write to the DB; `ingest_traces`
 * mutates edge weights. The IDE owns these.
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
  /**
   * Absolute path to the project root the standalone is serving. The IDE
   * names projects by `path.basename(path.resolve(projectRoot))` (see
   * `systemTwoRegistry.ts`). Defaults to `process.cwd()` — Claude Code
   * spawns child processes with cwd = project root, so the default is
   * correct for normal usage.
   */
  projectRoot?: string;
}

export interface BuiltServer {
  server: Server;
  toolNames: string[];
  projectName: string;
  close: () => void;
}

export function buildOuroborosMcpServer(input: BuildServerInput): BuiltServer {
  const projectRoot = input.projectRoot ?? process.cwd();
  const projectName = path.basename(path.resolve(projectRoot));

  const db = new GraphDatabase(input.dbPath, { readonly: true });
  const queryEngine = new QueryEngine(db, projectName, projectRoot);
  const cypherEngine = new CypherEngine(db, projectName);

  const tools = filterReadOnlyTools(
    createGraphMcpTools({
      db,
      queryEngine,
      cypherEngine,
      projectName,
      projectRoot,
      pipeline: { index: () => Promise.reject(new Error('standalone is read-only')) },
    }),
  );

  const server = registerHandlers(tools);
  return {
    server,
    toolNames: tools.map((t) => t.name),
    projectName,
    close: () => db.close(),
  };
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
