/**
 * ideToolServerConnection.ts — Per-connection handler logic for the IDE tool server.
 *
 * Extracted from ideToolServer.ts to stay under the 300-line ESLint limit.
 * Owns: request dispatch, buffer draining, per-connection cancel registry.
 */

import net from 'net';

import type { ToolRequest, ToolResponse } from './ideToolServer';
import { createToolHandlers, execGitStatus } from './ideToolServerHandlers';
import {
  createToolErrorResponse,
  parseToolRequest,
  writeToolResponse,
} from './ideToolServerHelpers';
import log from './logger';
import { validatePipeAuthWithGrace } from './pipeAuth';

// ─── Request dispatch ─────────────────────────────────────────────────────────

export function makeHandleRequest(
  connToolHandlers: Record<string, (params: Record<string, unknown>) => Promise<unknown>>,
): (request: ToolRequest) => Promise<ToolResponse> {
  return async (request: ToolRequest): Promise<ToolResponse> => {
    const { id, method, params } = request;
    // eslint-disable-next-line security/detect-object-injection -- method is validated JSON-RPC string
    const handler = connToolHandlers[method];
    if (!handler) {
      return {
        id,
        error: {
          code: -32601,
          message: `Unknown method: ${method}. Available: ${Object.keys(connToolHandlers).join(', ')}`,
        },
      };
    }
    try {
      const result = await handler(params ?? {});
      return { id, result };
    } catch (err) {
      return { id, error: { code: -1, message: (err as Error).message || String(err) } };
    }
  };
}

function dispatchToolRequest(
  socket: net.Socket,
  connId: number,
  request: ToolRequest,
  handleRequest: (req: ToolRequest) => Promise<ToolResponse>,
): void {
  log.debug(`#${connId} request: ${request.method}`);
  void handleRequest(request)
    .then((response) => { if (!socket.destroyed) writeToolResponse(socket, response); })
    .catch((err) => {
      if (!socket.destroyed) {
        writeToolResponse(socket, createToolErrorResponse(request.id, -1, (err as Error).message));
      }
    });
}

function processSocketLine(
  socket: net.Socket,
  connId: number,
  line: string,
  handleRequest: (req: ToolRequest) => Promise<ToolResponse>,
): void {
  if (!line) return;
  const { request, errorResponse } = parseToolRequest(line);
  if (errorResponse) { writeToolResponse(socket, errorResponse); return; }
  if (request) dispatchToolRequest(socket, connId, request, handleRequest);
}

function drainSocketBuffer(
  socket: net.Socket,
  connId: number,
  rawBuffer: string,
  handleRequest: (req: ToolRequest) => Promise<ToolResponse>,
): string {
  let buf = rawBuffer;
  let nl = buf.indexOf('\n');
  while (nl !== -1) {
    processSocketLine(socket, connId, buf.slice(0, nl).trim(), handleRequest);
    buf = buf.slice(nl + 1);
    nl = buf.indexOf('\n');
  }
  return buf;
}

// ─── Per-connection context ───────────────────────────────────────────────────

export interface ConnContext {
  rawBuffer: string;
  authenticated: boolean;
  cancelFns: Array<() => void>;
  handleRequest: (req: ToolRequest) => Promise<ToolResponse>;
}

export function makeConnContext(
  queryRenderer: (method: string, params?: unknown) => Promise<unknown>,
): ConnContext {
  const cancelFns: Array<() => void> = [];
  const connToolHandlers = createToolHandlers({
    queryRenderer,
    execGitStatus,
    registerCancel: (c) => cancelFns.push(c),
  });
  return {
    rawBuffer: '',
    authenticated: false,
    cancelFns,
    handleRequest: makeHandleRequest(connToolHandlers),
  };
}

// ─── Data + auth handler ──────────────────────────────────────────────────────

const MAX_BUFFER_BYTES = 1_048_576;

export function handleSocketData(
  socket: net.Socket,
  connId: number,
  ctx: ConnContext,
  chunk: string,
): void {
  if (!ctx.authenticated) {
    ctx.rawBuffer += chunk;
    const nl = ctx.rawBuffer.indexOf('\n');
    if (nl === -1) return;
    const firstLine = ctx.rawBuffer.slice(0, nl).trim();
    ctx.rawBuffer = ctx.rawBuffer.slice(nl + 1);
    if (!validatePipeAuthWithGrace(firstLine, 'tool')) {
      log.debug(`#${connId} auth failed — rejecting`);
      socket.end('{"error":"unauthorized"}\n');
      return;
    }
    ctx.authenticated = true;
  }

  const nextBuffer = ctx.rawBuffer + chunk;
  if (Buffer.byteLength(nextBuffer, 'utf8') > MAX_BUFFER_BYTES) {
    log.warn(`#${connId} buffer overflow — dropping connection`);
    socket.destroy();
    ctx.rawBuffer = '';
    return;
  }
  ctx.rawBuffer = drainSocketBuffer(socket, connId, nextBuffer, ctx.handleRequest);
}
