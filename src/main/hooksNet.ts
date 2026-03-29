/**
 * hooksNet.ts — Named pipe / TCP socket handling for the hooks server.
 *
 * Extracted from hooks.ts to keep each file under the 300-line limit.
 * Handles socket I/O, NDJSON parsing, and net.Server lifecycle.
 */

import { BrowserWindow } from 'electron';
import net from 'net';

import { getConfigValue } from './config';
import type { HookPayload } from './hooks';
import log from './logger';
import { broadcastToWebClients } from './web/webServer';

const PIPE_NAME = '\\\\.\\pipe\\agent-ide-hooks';
const MAX_BUFFER_BYTES = 1_048_576;

const VALID_TYPES = new Set<string>([
  'pre_tool_use',
  'post_tool_use',
  'agent_start',
  'agent_stop',
  'agent_end',
  'session_start',
  'session_stop',
  'instructions_loaded',
]);

let connectionCounter = 0;
let server: net.Server | null = null;

function isValidPayload(obj: unknown): obj is HookPayload {
  if (!obj || typeof obj !== 'object') return false;
  const payload = obj as Record<string, unknown>;
  if (typeof payload.sessionId !== 'string' || !payload.sessionId) return false;
  if (typeof payload.timestamp !== 'number') return false;
  if (typeof payload.type !== 'string' || !VALID_TYPES.has(payload.type)) return false;
  return true;
}

function parseHookLine(line: string, connId: number): HookPayload | null {
  try {
    const parsed = JSON.parse(line);
    if (!isValidPayload(parsed)) {
      log.warn(`#${connId} invalid payload shape - skipping`, JSON.stringify(parsed));
      return null;
    }
    log.info(`#${connId} valid payload: type=${parsed.type} session=${parsed.sessionId}`);
    return parsed;
  } catch {
    log.warn(`#${connId} malformed JSON - skipping line`);
    return null;
  }
}

interface SocketChunkArgs {
  socket: net.Socket;
  connId: number;
  rawBuffer: string;
  chunk: string;
  onPayload: (p: HookPayload) => void;
}

function processSocketChunk(args: SocketChunkArgs): string {
  const { socket, connId, rawBuffer, chunk, onPayload } = args;
  const nextBuffer = rawBuffer + chunk;
  if (Buffer.byteLength(nextBuffer, 'utf8') > MAX_BUFFER_BYTES) {
    log.warn(`#${connId} buffer overflow - dropping connection`);
    socket.destroy();
    return '';
  }

  let buffer = nextBuffer;
  let newlineIndex = buffer.indexOf('\n');
  while (newlineIndex !== -1) {
    const line = buffer.slice(0, newlineIndex).trim();
    buffer = buffer.slice(newlineIndex + 1);
    if (line) {
      const payload = parseHookLine(line, connId);
      if (payload) onPayload(payload);
    }
    newlineIndex = buffer.indexOf('\n');
  }

  return buffer;
}

function handleSocket(
  socket: net.Socket,
  connId: number,
  onPayload: (p: HookPayload) => void,
): void {
  log.info(`connection #${connId} opened`);
  let rawBuffer = '';
  socket.setEncoding('utf8');
  socket.setTimeout(60_000);

  socket.on('data', (chunk: string) => {
    rawBuffer = processSocketChunk({ socket, connId, rawBuffer, chunk, onPayload });
  });
  socket.on('timeout', () => {
    socket.end();
  });
  socket.on('error', (error: NodeJS.ErrnoException) => {
    if (error.code !== 'EPIPE' && error.code !== 'ECONNRESET') {
      log.error(`#${connId} socket error: ${error.message}`);
    }
  });
  socket.on('close', () => {
    log.info(`connection #${connId} closed`);
  });
}

function createNetServer(onPayload: (p: HookPayload) => void): net.Server {
  const nextServer = net.createServer((socket) =>
    handleSocket(socket, ++connectionCounter, onPayload),
  );
  nextServer.maxConnections = 64;
  return nextServer;
}

function listenPipe(nextServer: net.Server, pipePath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    nextServer.once('error', reject);
    nextServer.listen(pipePath, () => {
      nextServer.removeListener('error', reject);
      resolve();
    });
  });
}

function listenTcp(nextServer: net.Server, port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    nextServer.once('error', reject);
    nextServer.listen(port, '127.0.0.1', () => {
      nextServer.removeListener('error', reject);
      resolve();
    });
  });
}

function flushPendingQueueToWindow(window: BrowserWindow, pendingQueue: HookPayload[]): void {
  if (pendingQueue.length === 0 || window.isDestroyed()) return;
  const flushing = pendingQueue.splice(0);
  for (const payload of flushing) {
    window.webContents.send('hooks:event', payload);
    broadcastToWebClients('hooks:event', payload);
  }
}

export async function startHooksNetServer(
  window: BrowserWindow,
  pendingQueue: HookPayload[],
  onPayload: (p: HookPayload) => void,
): Promise<{ port: number | string }> {
  window.webContents.on('did-finish-load', () => {
    flushPendingQueueToWindow(window, pendingQueue);
  });

  if (server) {
    const address = server.address();
    const port = typeof address === 'string' ? address : (address as net.AddressInfo).port;
    return { port };
  }

  if (process.platform === 'win32') {
    const pipeServer = createNetServer(onPayload);
    try {
      await listenPipe(pipeServer, PIPE_NAME);
      server = pipeServer;
      log.info(`listening on named pipe ${PIPE_NAME}`);
      return { port: PIPE_NAME };
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException;
      log.warn(`named pipe unavailable (${nodeError.code ?? 'unknown'}) - falling back to TCP`);
      pipeServer.close();
    }
  }

  const port = getConfigValue('hooksServerPort') as number;
  const tcpServer = createNetServer(onPayload);
  await listenTcp(tcpServer, port);
  server = tcpServer;
  log.info(`TCP server listening on 127.0.0.1:${port}`);
  return { port };
}

export function stopHooksNetServer(): Promise<void> {
  return new Promise((resolve) => {
    if (!server) {
      resolve();
      return;
    }
    server.close(() => {
      server = null;
      log.info('server stopped');
      resolve();
    });
  });
}

export function getHooksNetAddress(): string | null {
  if (!server) return null;
  const address = server.address();
  if (!address) return null;
  if (typeof address === 'string') return address;
  return `127.0.0.1:${address.port}`;
}
