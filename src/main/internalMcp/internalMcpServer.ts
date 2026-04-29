/**
 * internalMcpServer.ts — Wave 53i: SDK-backed implementation
 *
 * Replaces the hand-rolled SSE/JSON-RPC dispatch (Waves 53d–53h) with the
 * official `@modelcontextprotocol/sdk` v1.29.0 transport classes. We keep:
 *   - Node `http.createServer` scaffolding for port allocation, listen,
 *     stop lifecycle (preserves the existing `InternalMcpServerHandle`
 *     contract).
 *   - The `getActiveTools()` / `findTool()` registry (graph-healthy → 14
 *     tools; degraded → 6 fallback tools).
 *   - SSE wire format (Claude Code's client connects to /sse + /message
 *     with type:"sse"; per Wave 53h smoke).
 *
 * What changes:
 *   - `SSEServerTransport` from the SDK handles the SSE handshake (endpoint
 *     event, sessionId, response routing). Wave 53h's hand-rolled
 *     equivalent is retired.
 *   - `Server` (the low-level SDK server) hosts our `tools/list` and
 *     `tools/call` request handlers. We bypass `McpServer.registerTool`
 *     because it requires Zod schemas; our existing tool definitions use
 *     JSON Schema objects compatible with the SDK's `setRequestHandler`
 *     pathway.
 *   - One `Server` + one `SSEServerTransport` per SSE connection. Both
 *     close when the underlying HTTP request closes.
 *
 * Wire format produced by the SDK (verified by Phase B smoke):
 *   GET /sse → `event: endpoint\ndata: /message?sessionId=<UUID>\n\n`
 *   POST /message?sessionId=<X> → JSON-RPC dispatch via the matching
 *     transport; response delivered as `event: message` on the SSE stream.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import type { IncomingMessage, ServerResponse } from 'http';
import http from 'http';
import type { AddressInfo } from 'net';

import { findTool, getActiveTools } from './internalMcpTools';
import type { InternalMcpServerHandle, InternalMcpServerOptions } from './internalMcpTypes';

// ---------------------------------------------------------------------------
// Active connection registry — one entry per open /sse connection.
// ---------------------------------------------------------------------------

interface SseConnection {
  transport: SSEServerTransport;
  server: Server;
}

const sseConnections = new Map<string, SseConnection>();

// ---------------------------------------------------------------------------
// Per-connection MCP Server factory
// ---------------------------------------------------------------------------

function createMcpServer(workspaceRoot: string): Server {
  const server = new Server(
    { name: 'ouroboros', version: '1.0.0' },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: getActiveTools().map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema as Record<string, unknown>,
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const { name, arguments: args } = req.params;
    const tool = findTool(name);
    if (!tool) {
      return { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true };
    }
    try {
      const text = await tool.handler(
        (args ?? {}) as Record<string, unknown>,
        workspaceRoot,
      );
      return { content: [{ type: 'text', text }], isError: false };
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      return { content: [{ type: 'text', text: `Error: ${errMsg}` }], isError: true };
    }
  });

  return server;
}

// ---------------------------------------------------------------------------
// Routing handlers
// ---------------------------------------------------------------------------

async function handleSseConnection(
  req: IncomingMessage,
  res: ServerResponse,
  workspaceRoot: string,
): Promise<void> {
  // Endpoint URI passed to SSEServerTransport is what the client will POST
  // to. Relative path `/message` keeps the URL host/port-agnostic and
  // matches the route registered below.
  const transport = new SSEServerTransport('/message', res);
  const server = createMcpServer(workspaceRoot);

  sseConnections.set(transport.sessionId, { transport, server });

  const cleanup = (): void => {
    sseConnections.delete(transport.sessionId);
    transport.close().catch(() => undefined);
    server.close().catch(() => undefined);
  };
  res.on('close', cleanup);
  req.on('close', cleanup);

  // server.connect() calls transport.start() internally, which writes the
  // SSE headers + endpoint event including ?sessionId=<UUID>.
  await server.connect(transport);
}

function extractSessionId(url: string | undefined): string | null {
  if (!url) return null;
  const queryStart = url.indexOf('?');
  if (queryStart === -1) return null;
  return new URLSearchParams(url.slice(queryStart + 1)).get('sessionId');
}

async function handlePost(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const sessionId = extractSessionId(req.url);
  if (!sessionId) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Missing sessionId query parameter' }));
    return;
  }
  const conn = sseConnections.get(sessionId);
  if (!conn) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Unknown sessionId' }));
    return;
  }
  await conn.transport.handlePostMessage(req, res);
}

// ---------------------------------------------------------------------------
// HTTP request router
// ---------------------------------------------------------------------------

function createRequestHandler(
  workspaceRoot: string,
): (req: IncomingMessage, res: ServerResponse) => Promise<void> {
  return async (req: IncomingMessage, res: ServerResponse) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const pathOnly = (req.url ?? '').split('?')[0];

    if (req.method === 'GET' && pathOnly === '/sse') {
      await handleSseConnection(req, res, workspaceRoot);
      return;
    }

    if (req.method === 'POST' && pathOnly === '/message') {
      await handlePost(req, res);
      return;
    }

    if (req.method === 'GET' && pathOnly === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', server: 'ouroboros', workspaceRoot }));
      return;
    }

    res.writeHead(404);
    res.end();
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Start the internal MCP HTTP+SSE server using the official SDK transport.
 * Wired into `main.ts` startup (gated by `internalMcpEnabled`).
 *
 * Wave 51's stdio transport adapter (`internalMcpStdioTransport.ts`)
 * continues to forward stdio JSON-RPC frames to `/message` — same endpoint
 * the SDK transport accepts.
 */
export async function startInternalMcpServer(
  options: InternalMcpServerOptions,
): Promise<InternalMcpServerHandle> {
  const { workspaceRoot, port = 0 } = options;

  return new Promise((resolve, reject) => {
    const server = http.createServer(createRequestHandler(workspaceRoot));

    server.on('error', (err) => {
      reject(err);
    });

    // Bind to localhost only — never expose to network
    server.listen(port, '127.0.0.1', () => {
      const address = server.address() as AddressInfo;
      const actualPort = address.port;

      const handle: InternalMcpServerHandle = {
        port: actualPort,
        stop: () =>
          new Promise<void>((res, rej) => {
            // Close all active SSE connections + their per-connection servers
            for (const conn of sseConnections.values()) {
              conn.transport.close().catch(() => undefined);
              conn.server.close().catch(() => undefined);
            }
            sseConnections.clear();
            server.close((err) => {
              if (err) rej(err);
              else res();
            });
          }),
      };

      resolve(handle);
    });
  });
}
