import { randomUUID } from 'crypto';
import type { IncomingMessage, ServerResponse } from 'http';
import http from 'http';
import type { AddressInfo } from 'net';

import { findTool, getActiveTools } from './internalMcpTools';
import type { InternalMcpServerHandle, InternalMcpServerOptions } from './internalMcpTypes';

// ---------------------------------------------------------------------------
// SSE connection registry — Wave 53h
// ---------------------------------------------------------------------------
//
// The MCP HTTP+SSE transport (2024-11-05) routes JSON-RPC responses back to
// the client via the SSE stream, not the POST response body. The
// `@modelcontextprotocol/sdk` SSEClientTransport requires this routing: when
// a client opens GET /sse, the server generates a unique sessionId, includes
// it in the `endpoint` event's URL (`/message?sessionId=<uuid>`), and tracks
// the SSE response by that id. When a POST /message?sessionId=<id> arrives,
// the server dispatches the RPC and pushes the response as `event: message`
// on the matching SSE stream.
//
// We also keep returning the response in the POST body for backward compat
// with curl-based smokes and the strict subset of clients that read the body
// instead of the SSE stream.

const sseConnections = new Map<string, ServerResponse>();

// ---------------------------------------------------------------------------
// JSON-RPC helpers
// ---------------------------------------------------------------------------

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

function rpcSuccess(id: string | number | null | undefined, result: unknown): string {
  return JSON.stringify({ jsonrpc: '2.0', id: id ?? null, result });
}

function rpcError(id: string | number | null | undefined, code: number, message: string): string {
  return JSON.stringify({ jsonrpc: '2.0', id: id ?? null, error: { code, message } });
}

// ---------------------------------------------------------------------------
// Read full POST body
// ---------------------------------------------------------------------------

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    req.on('error', reject);
  });
}

// ---------------------------------------------------------------------------
// SSE handler
// ---------------------------------------------------------------------------

function handleSse(req: IncomingMessage, res: ServerResponse): void {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'Access-Control-Allow-Origin': '*',
  });

  // Wave 53h: Per the MCP TypeScript SDK reference SSEServerTransport, the
  // endpoint URL must include a `sessionId` query parameter. The SDK client
  // uses this id as the routing key to associate POST messages with the SSE
  // stream and to receive JSON-RPC responses on the same stream. Without
  // sessionId, the SDK client (which Claude Code uses) reports "Failed to
  // connect" or surfaces an auth-prompt error. Wave 53f got the endpoint
  // event format right but skipped the sessionId — that's why post-53f
  // smokes still failed.
  const sessionId = randomUUID();
  sseConnections.set(sessionId, res);
  res.write(`event: endpoint\ndata: /message?sessionId=${sessionId}\n\n`);

  // Heartbeat every 30 seconds to keep the connection alive
  const heartbeat = setInterval(() => {
    try {
      res.write(': heartbeat\n\n');
    } catch {
      clearInterval(heartbeat);
    }
  }, 30_000);

  req.on('close', () => {
    clearInterval(heartbeat);
    sseConnections.delete(sessionId);
  });
}

// ---------------------------------------------------------------------------
// JSON-RPC handler
// ---------------------------------------------------------------------------

async function parseRpcRequest(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<{ rpc: JsonRpcRequest; id: string | number | null } | null> {
  let body: string;
  try {
    body = await readBody(req);
  } catch {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(rpcError(null, -32700, 'Parse error: could not read request body'));
    return null;
  }

  try {
    const rpc = JSON.parse(body) as JsonRpcRequest;
    return { rpc, id: rpc.id ?? null };
  } catch {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(rpcError(null, -32700, 'Parse error: invalid JSON'));
    return null;
  }
}

async function dispatchRpcMethod(
  rpc: JsonRpcRequest,
  id: string | number | null,
  workspaceRoot: string,
): Promise<string> {
  switch (rpc.method) {
    case 'initialize':
      return rpcSuccess(id, {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'ouroboros', version: '1.0.0' },
      });

    case 'tools/list': {
      const tools = getActiveTools().map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema,
      }));
      return rpcSuccess(id, { tools });
    }

    case 'tools/call':
      return handleToolCall(rpc, id, workspaceRoot);

    default:
      return rpcError(id, -32601, `Method not found: ${rpc.method}`);
  }
}

async function handleToolCall(
  rpc: JsonRpcRequest,
  id: string | number | null,
  workspaceRoot: string,
): Promise<string> {
  const params = (rpc.params ?? {}) as { name?: string; arguments?: Record<string, unknown> };
  const toolName = params.name;
  const toolArgs = params.arguments ?? {};

  if (!toolName) return rpcError(id, -32602, 'Invalid params: missing tool name');

  const tool = findTool(toolName);
  if (!tool) {
    return rpcSuccess(id, {
      content: [{ type: 'text', text: `Unknown tool: ${toolName}` }],
      isError: true,
    });
  }

  try {
    const text = await tool.handler(toolArgs, workspaceRoot);
    return rpcSuccess(id, { content: [{ type: 'text', text }], isError: false });
  } catch (toolErr) {
    const errMsg = toolErr instanceof Error ? toolErr.message : String(toolErr);
    return rpcSuccess(id, { content: [{ type: 'text', text: `Error: ${errMsg}` }], isError: true });
  }
}

function pushResponseToSse(sessionId: string | null, responseBody: string): void {
  if (!sessionId) return;
  const sse = sseConnections.get(sessionId);
  if (!sse) return;
  try {
    // Per MCP HTTP+SSE transport spec, JSON-RPC responses are delivered to the
    // client via an `event: message` SSE event on the connection associated
    // with the request's sessionId. The SDK client looks for it on the SSE
    // stream; without this, the connection appears hung and times out.
    sse.write(`event: message\ndata: ${responseBody}\n\n`);
  } catch {
    // SSE connection might have closed mid-flight; safe to ignore.
  }
}

function extractSessionId(url: string | undefined): string | null {
  if (!url) return null;
  const queryStart = url.indexOf('?');
  if (queryStart === -1) return null;
  const params = new URLSearchParams(url.slice(queryStart + 1));
  return params.get('sessionId');
}

async function handleJsonRpc(
  req: IncomingMessage,
  res: ServerResponse,
  workspaceRoot: string,
): Promise<void> {
  const parsed = await parseRpcRequest(req, res);
  if (!parsed) return;

  const { rpc, id } = parsed;
  const sessionId = extractSessionId(req.url);

  try {
    const responseBody = await dispatchRpcMethod(rpc, id, workspaceRoot);
    // Dual-write: SSE stream (for SDK clients) + response body (for direct
    // POST callers like curl). The SDK client ignores the body; loose clients
    // ignore the SSE event. Keeping both maximises compat without changing
    // observable behaviour for the SDK client.
    pushResponseToSse(sessionId, responseBody);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(responseBody);
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    const errorBody = rpcError(id, -32603, `Internal error: ${errMsg}`);
    pushResponseToSse(sessionId, errorBody);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(errorBody);
  }
}

// ---------------------------------------------------------------------------
// Public API
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

    // Match path component only (URL may include `?sessionId=...` query).
    const pathOnly = (req.url ?? '').split('?')[0];

    if (req.method === 'GET' && pathOnly === '/sse') {
      handleSse(req, res);
      return;
    }

    if (req.method === 'POST' && pathOnly === '/message') {
      await handleJsonRpc(req, res, workspaceRoot);
      return;
    }

    if (req.method === 'GET' && req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', server: 'ouroboros', workspaceRoot }));
      return;
    }

    res.writeHead(404);
    res.end();
  };
}

/**
 * Start the internal MCP HTTP+SSE server. Wired into `main.ts` startup
 * (gated by `internalMcpEnabled`, default true). Wave 51 added a stdio
 * transport adapter (`internalMcpStdioTransport.ts`) that forwards stdio
 * JSON-RPC to the same `/message` endpoint this server exposes — both
 * transports share the tool surface defined by `getActiveTools()`.
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
