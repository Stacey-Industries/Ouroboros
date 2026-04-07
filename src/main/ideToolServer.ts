/**
 * ideToolServer.ts â€” JSON-RPC-like tool server over named pipe / Unix socket.
 *
 * This is the REVERSE channel: Claude Code hook scripts can connect and query
 * the IDE for context (open files, editor state, git status, diagnostics, etc.).
 *
 * Protocol: newline-delimited JSON (NDJSON), one request per connection.
 *   Request:  { "id": "<uuid>", "method": "ide.getOpenFiles", "params": {} }
 *   Response: { "id": "<uuid>", "result": [...] }
 *             or { "id": "<uuid>", "error": { "code": -1, "message": "..." } }
 *
 * Windows:  \\.\pipe\ouroboros-tools
 * Unix:     /tmp/ouroboros-tools.sock
 */

import fs from 'fs';
import net from 'net';

import type { ToolHandler } from './ideToolServerHandlers';
import { createToolHandlers, execGitStatus } from './ideToolServerHandlers';
import {
  createToolErrorResponse,
  formatAddress,
  parseToolRequest,
  writeToolResponse,
} from './ideToolServerHelpers';
import log from './logger';
import { getToolServerToken, validatePipeAuth } from './pipeAuth';
import { broadcastToWebClients } from './web/webServer';
import { getAllActiveWindows } from './windowManager';

// â”€â”€â”€ Types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export interface ToolRequest {
  id: string;
  method: string;
  params?: Record<string, unknown>;
}

export interface ToolResponse {
  id: string;
  result?: unknown;
  error?: { code: number; message: string };
}

// â”€â”€â”€ Constants â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const PIPE_NAME = '\\\\.\\pipe\\ouroboros-tools';
const UNIX_SOCKET_PATH = '/tmp/ouroboros-tools.sock';
const MAX_BUFFER_BYTES = 1_048_576; // 1 MB per connection
const REQUEST_TIMEOUT_MS = 10_000; // 10 s timeout for renderer queries

// â”€â”€â”€ Module state â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

let server: net.Server | null = null;
let connectionCounter = 0;

/** Pending renderer queries â€” resolved when the renderer responds via IPC. */
const pendingRendererQueries = new Map<
  string,
  {
    resolve: (value: unknown) => void;
    reject: (reason: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  }
>();

// â”€â”€â”€ Renderer query system â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

let queryIdCounter = 0;

/**
 * Send a query to the renderer and await a response.
 * The renderer listens for `ide:query` events and responds via `ide:queryResponse`.
 */
function queryRenderer(method: string, params?: unknown): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const windows = getAllActiveWindows();
    if (windows.length === 0) {
      reject(new Error('No active renderer window'));
      return;
    }

    const queryId = `ideq_${++queryIdCounter}_${Date.now()}`;
    const win = windows[0];
    const timer = setTimeout(() => {
      pendingRendererQueries.delete(queryId);
      reject(new Error(`Renderer query timed out: ${method}`));
    }, REQUEST_TIMEOUT_MS);

    pendingRendererQueries.set(queryId, { resolve, reject, timer });

    if (!win.isDestroyed()) {
      win.webContents.send('ide:query', { queryId, method, params });
    }
    broadcastToWebClients('ide:query', { queryId, method, params });
    if (!win.isDestroyed()) return;

    clearTimeout(timer);
    pendingRendererQueries.delete(queryId);
    reject(new Error('Renderer window is destroyed'));
  });
}

/**
 * Called from IPC when the renderer responds to a query.
 */
export function handleRendererQueryResponse(
  queryId: string,
  result: unknown,
  error?: string,
): void {
  const pending = pendingRendererQueries.get(queryId);
  if (!pending) return;

  clearTimeout(pending.timer);
  pendingRendererQueries.delete(queryId);

  if (error) {
    pending.reject(new Error(error));
  } else {
    pending.resolve(result);
  }
}

const toolHandlers: Record<string, ToolHandler> = createToolHandlers({
  queryRenderer,
  execGitStatus,
});

// â”€â”€â”€ Request handler â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async function handleRequest(request: ToolRequest): Promise<ToolResponse> {
  const { id, method, params } = request;
  // eslint-disable-next-line security/detect-object-injection -- method is a string from validated JSON-RPC request
  const handler = toolHandlers[method];

  if (!handler) {
    return {
      id,
      error: {
        code: -32601,
        message: `Unknown method: ${method}. Available: ${Object.keys(toolHandlers).join(', ')}`,
      },
    };
  }

  try {
    const result = await handler(params ?? {});
    return { id, result };
  } catch (err) {
    return {
      id,
      error: {
        code: -1,
        message: (err as Error).message || String(err),
      },
    };
  }
}

function dispatchToolRequest(socket: net.Socket, connId: number, request: ToolRequest): void {
  log.debug(`#${connId} request: ${request.method}`);

  void handleRequest(request)
    .then((response) => {
      if (!socket.destroyed) {
        writeToolResponse(socket, response);
      }
    })
    .catch((err) => {
      if (!socket.destroyed) {
        writeToolResponse(socket, createToolErrorResponse(request.id, -1, (err as Error).message));
      }
    });
}

function processSocketLine(socket: net.Socket, connId: number, line: string): void {
  if (!line) return;

  const { request, errorResponse } = parseToolRequest(line);
  if (errorResponse) {
    writeToolResponse(socket, errorResponse);
    return;
  }

  if (request) {
    dispatchToolRequest(socket, connId, request);
  }
}

function drainSocketBuffer(socket: net.Socket, connId: number, rawBuffer: string): string {
  let nextBuffer = rawBuffer;
  let newLineIndex = nextBuffer.indexOf('\n');

  while (newLineIndex !== -1) {
    const line = nextBuffer.slice(0, newLineIndex).trim();
    nextBuffer = nextBuffer.slice(newLineIndex + 1);
    processSocketLine(socket, connId, line);
    newLineIndex = nextBuffer.indexOf('\n');
  }

  return nextBuffer;
}

function handleSocketChunk(
  socket: net.Socket,
  connId: number,
  rawBuffer: string,
  chunk: string,
): string {
  const nextBuffer = rawBuffer + chunk;

  if (Buffer.byteLength(nextBuffer, 'utf8') > MAX_BUFFER_BYTES) {
    log.warn(`#${connId} buffer overflow — dropping connection`);
    socket.destroy();
    return '';
  }

  return drainSocketBuffer(socket, connId, nextBuffer);
}

function logSocketError(connId: number, err: NodeJS.ErrnoException): void {
  if (err.code !== 'EPIPE' && err.code !== 'ECONNRESET') {
    log.error(`#${connId} socket error: ${err.message}`);
  }
}

// â”€â”€â”€ Per-connection handler â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function handleSocket(socket: net.Socket, connId: number): void {
  log.debug(`connection #${connId} opened`);

  let rawBuffer = '';
  let authenticated = false;

  socket.setEncoding('utf8');
  socket.setTimeout(30_000);

  socket.on('data', (chunk: string) => {
    if (!authenticated) {
      rawBuffer += chunk;
      const nl = rawBuffer.indexOf('\n');
      if (nl === -1) return;
      const firstLine = rawBuffer.slice(0, nl).trim();
      rawBuffer = rawBuffer.slice(nl + 1);
      if (!validatePipeAuth(firstLine, getToolServerToken())) {
        log.warn(`#${connId} auth failed — rejecting`);
        socket.end('{"error":"unauthorized"}\n');
        return;
      }
      authenticated = true;
    }
    rawBuffer = handleSocketChunk(socket, connId, rawBuffer, chunk);
  });

  socket.on('timeout', () => {
    socket.end();
    // Force-destroy after grace period to prevent half-open socket handle leaks
    setTimeout(() => {
      if (!socket.destroyed) socket.destroy();
    }, 5_000);
  });

  socket.on('error', (err: NodeJS.ErrnoException) => {
    logSocketError(connId, err);
  });

  socket.on('close', () => {
    log.debug(`connection #${connId} closed`);
  });
}

// â”€â”€â”€ Server helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function createNetServer(): net.Server {
  const socketServer = net.createServer((socket) => handleSocket(socket, ++connectionCounter));
  socketServer.maxConnections = 64;
  return socketServer;
}

function listenPipe(socketServer: net.Server, pipePath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    socketServer.once('error', reject);
    socketServer.listen(pipePath, () => {
      socketServer.removeListener('error', reject);
      resolve();
    });
  });
}

function listenUnix(socketServer: net.Server, socketPath: string): Promise<void> {
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- socketPath is a fixed IPC socket location
    fs.unlinkSync(socketPath);
  } catch {
    // File doesn't exist â€” fine
  }

  return new Promise((resolve, reject) => {
    socketServer.once('error', reject);
    socketServer.listen(socketPath, () => {
      socketServer.removeListener('error', reject);
      resolve();
    });
  });
}

function rejectPendingQueries(): void {
  for (const [, pending] of pendingRendererQueries) {
    clearTimeout(pending.timer);
    pending.reject(new Error('Tool server shutting down'));
  }

  pendingRendererQueries.clear();
}

function cleanupUnixSocket(): void {
  if (process.platform === 'win32') return;

  try {
    fs.unlinkSync(UNIX_SOCKET_PATH);
  } catch {
    // Already gone
  }
}

// â”€â”€â”€ Public API â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export async function startIdeToolServer(): Promise<{ address: string } | null> {
  if (server) {
    const address = formatAddress(server.address());
    return { address: address ?? PIPE_NAME };
  }

  const nextServer = createNetServer();

  if (process.platform === 'win32') {
    try {
      await listenPipe(nextServer, PIPE_NAME);
      server = nextServer;
      log.info(`listening on named pipe ${PIPE_NAME}`);
      return { address: PIPE_NAME };
    } catch (err: unknown) {
      const nodeErr = err as NodeJS.ErrnoException;
      nextServer.close();
      if (nodeErr.code === 'EADDRINUSE') {
        log.info(`pipe already held by another instance — skipping`);
        return null;
      }
      log.warn(`named pipe unavailable (${nodeErr.code ?? 'unknown'})`);
      throw err;
    }
  }

  try {
    await listenUnix(nextServer, UNIX_SOCKET_PATH);
    server = nextServer;
    log.info(`listening on Unix socket ${UNIX_SOCKET_PATH}`);
    return { address: UNIX_SOCKET_PATH };
  } catch (err: unknown) {
    const nodeErr = err as NodeJS.ErrnoException;
    nextServer.close();
    if (nodeErr.code === 'EADDRINUSE') {
      log.info(`socket already held by another instance — skipping`);
      return null;
    }
    log.warn(`Unix socket unavailable (${nodeErr.code ?? 'unknown'})`);
    throw err;
  }
}

export function stopIdeToolServer(): Promise<void> {
  return new Promise((resolve) => {
    rejectPendingQueries();

    if (!server) {
      resolve();
      return;
    }

    server.close(() => {
      server = null;
      log.info('server stopped');
      cleanupUnixSocket();
      resolve();
    });
  });
}

/** Returns the address the tool server is listening on, or null if not started. */
export function getIdeToolServerAddress(): string | null {
  return server ? formatAddress(server.address()) : null;
}
