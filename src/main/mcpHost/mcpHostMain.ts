/**
 * mcpHostMain.ts — McpHost utility process entry point.
 *
 * Owns the HTTP/SSE server for the internal MCP server. All tool list and
 * tool call requests are dispatched back to main via parentPort because the
 * actual tool implementations need main-process singletons.
 *
 * The bootstrap is wrapped in a parentPort guard so the file is importable
 * from tests without an Electron parent.
 */

import type { IncomingMessage, Server, ServerResponse } from 'http';
import http from 'http';
import type { AddressInfo } from 'net';

import type {
  McpHostEvent,
  McpHostOutbound,
  McpHostRequest,
  McpHostResponse,
  McpHostToolDef,
} from './mcpHostProtocol';

// ── Server state ──

let server: Server | null = null;
let workspaceRoot = '';

// ── parentPort messaging ──

declare const process: NodeJS.Process & {
  parentPort?: { postMessage: (msg: unknown) => void; on: (e: 'message', cb: (m: unknown) => void) => void };
};

function post(msg: McpHostOutbound): void {
  process.parentPort?.postMessage(msg);
}

function postError(requestId: string, err: unknown): void {
  const message = err instanceof Error ? err.message : String(err);
  post({ type: 'error', requestId, message });
}

// ── Pending main-bound requests (toolList / toolCall) ──

interface PendingToolList { resolve: (tools: McpHostToolDef[]) => void; reject: (e: Error) => void }
interface PendingToolCall { resolve: (r: { text: string; isError: boolean }) => void; reject: (e: Error) => void }

const pendingToolLists = new Map<string, PendingToolList>();
const pendingToolCalls = new Map<string, PendingToolCall>();
let callCounter = 0;

function nextCallId(): string {
  callCounter += 1;
  return `mcp-${Date.now().toString(36)}-${callCounter}`;
}

function requestToolList(): Promise<McpHostToolDef[]> {
  const callId = nextCallId();
  return new Promise((resolve, reject) => {
    pendingToolLists.set(callId, { resolve, reject });
    post({ type: 'toolListRequest', callId });
  });
}

function requestToolCall(name: string, args: Record<string, unknown>): Promise<{ text: string; isError: boolean }> {
  const callId = nextCallId();
  return new Promise((resolve, reject) => {
    pendingToolCalls.set(callId, { resolve, reject });
    post({ type: 'toolCallRequest', callId, name, args });
  });
}

// ── JSON-RPC helpers ──

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

// ── HTTP request handling ──

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    req.on('error', reject);
  });
}

function handleSse(req: IncomingMessage, res: ServerResponse): void {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
  });
  res.write('data: {"jsonrpc":"2.0","method":"notifications/initialized"}\n\n');
  const heartbeat = setInterval(() => {
    try { res.write(': heartbeat\n\n'); }
    catch { clearInterval(heartbeat); }
  }, 30_000);
  req.on('close', () => clearInterval(heartbeat));
}

async function dispatchRpc(rpc: JsonRpcRequest, id: string | number | null): Promise<string> {
  switch (rpc.method) {
    case 'initialize':
      return rpcSuccess(id, {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'ouroboros', version: '1.0.0' },
      });
    case 'tools/list': {
      const tools = await requestToolList();
      return rpcSuccess(id, { tools });
    }
    case 'tools/call':
      return handleToolCall(rpc, id);
    default:
      return rpcError(id, -32601, `Method not found: ${rpc.method}`);
  }
}

async function handleToolCall(rpc: JsonRpcRequest, id: string | number | null): Promise<string> {
  const params = (rpc.params ?? {}) as { name?: string; arguments?: Record<string, unknown> };
  const toolName = params.name;
  const toolArgs = params.arguments ?? {};
  if (!toolName) return rpcError(id, -32602, 'Invalid params: missing tool name');
  try {
    const result = await requestToolCall(toolName, toolArgs);
    return rpcSuccess(id, { content: [{ type: 'text', text: result.text }], isError: result.isError });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    return rpcSuccess(id, { content: [{ type: 'text', text: `Error: ${errMsg}` }], isError: true });
  }
}

async function handleJsonRpc(req: IncomingMessage, res: ServerResponse): Promise<void> {
  let body: string;
  try { body = await readBody(req); }
  catch {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(rpcError(null, -32700, 'Parse error: could not read request body'));
    return;
  }
  let rpc: JsonRpcRequest;
  try { rpc = JSON.parse(body) as JsonRpcRequest; }
  catch {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(rpcError(null, -32700, 'Parse error: invalid JSON'));
    return;
  }
  try {
    const responseBody = await dispatchRpc(rpc, rpc.id ?? null);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(responseBody);
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(rpcError(rpc.id ?? null, -32603, `Internal error: ${errMsg}`));
  }
}

function buildRequestHandler(): (req: IncomingMessage, res: ServerResponse) => Promise<void> {
  return async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
    if (req.method === 'GET' && req.url === '/sse') { handleSse(req, res); return; }
    if (req.method === 'POST' && req.url === '/message') { await handleJsonRpc(req, res); return; }
    if (req.method === 'GET' && req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', server: 'ouroboros', workspaceRoot }));
      return;
    }
    res.writeHead(404); res.end();
  };
}

// ── Lifecycle handlers ──

function handleStart(requestId: string, root: string, port: number): void {
  if (server) {
    postError(requestId, 'McpHost server already started');
    return;
  }
  workspaceRoot = root;
  const newServer = http.createServer(buildRequestHandler());
  newServer.on('error', (err) => postError(requestId, err));
  newServer.listen(port, '127.0.0.1', () => {
    const address = newServer.address() as AddressInfo;
    server = newServer;
    post({ type: 'started', requestId, port: address.port });
  });
}

function handleStop(requestId: string): void {
  if (!server) {
    post({ type: 'stopped', requestId });
    return;
  }
  const closing = server;
  server = null;
  // Reject any in-flight requests so promises don't dangle
  for (const [, p] of pendingToolLists) p.reject(new Error('McpHost stopped'));
  for (const [, p] of pendingToolCalls) p.reject(new Error('McpHost stopped'));
  pendingToolLists.clear();
  pendingToolCalls.clear();
  closing.close((err) => {
    if (err) postError(requestId, err);
    else post({ type: 'stopped', requestId });
  });
}

function handleToolListResponse(callId: string, tools: McpHostToolDef[]): void {
  const pending = pendingToolLists.get(callId);
  if (!pending) return;
  pendingToolLists.delete(callId);
  pending.resolve(tools);
}

function handleToolCallResponse(callId: string, text: string, isError: boolean): void {
  const pending = pendingToolCalls.get(callId);
  if (!pending) return;
  pendingToolCalls.delete(callId);
  pending.resolve({ text, isError });
}

function handleToolCallError(callId: string, message: string): void {
  const pending = pendingToolCalls.get(callId);
  if (!pending) return;
  pendingToolCalls.delete(callId);
  pending.reject(new Error(message));
}

// ── Dispatcher ──

export function dispatch(msg: McpHostRequest): void {
  switch (msg.type) {
    case 'start': handleStart(msg.requestId, msg.workspaceRoot, msg.port); return;
    case 'stop': handleStop(msg.requestId); return;
    case 'toolListResponse': handleToolListResponse(msg.callId, msg.tools); return;
    case 'toolCallResponse': handleToolCallResponse(msg.callId, msg.text, msg.isError); return;
    case 'toolCallError': handleToolCallError(msg.callId, msg.message); return;
  }
}

/** Reset all state — used by tests. */
export function _resetForTests(): void {
  if (server) {
    try { server.close(); } catch { /* ignore */ }
  }
  server = null;
  workspaceRoot = '';
  pendingToolLists.clear();
  pendingToolCalls.clear();
  callCounter = 0;
}

/** Bootstrap parentPort listener. Skipped in test environment. */
function bootstrap(): void {
  if (typeof process.parentPort === 'undefined') return;
  process.parentPort.on('message', (raw: unknown) => {
    const data = (raw as { data?: unknown })?.data ?? raw;
    if (typeof data !== 'object' || data === null) return;
    try { dispatch(data as McpHostRequest); }
    catch (err) {
      const requestId = (data as { requestId?: string }).requestId ?? 'unknown';
      postError(requestId, err);
    }
  });
}

bootstrap();

export type { McpHostEvent,McpHostRequest, McpHostResponse };
