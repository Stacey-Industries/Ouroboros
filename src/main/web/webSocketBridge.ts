/**
 * webSocketBridge.ts — JSON-RPC 2.0 ↔ IPC bridge.
 *
 * Parses incoming JSON-RPC messages from WebSocket clients, looks up the
 * corresponding handler in the shared IPC handler registry, calls it with
 * a mock IpcMainInvokeEvent, and returns the result as a JSON-RPC response.
 *
 * Wave 33a Phase E: resume handshake dispatched via bridgeResume.ts.
 */

import { WebSocket } from 'ws';

import log from '../logger';
import { getAllActiveWindows } from '../windowManager';
import { enforceCapabilityOrRespond, type MobileAccessMeta } from './bridgeCapabilityGate';
import { type DispatchContext,dispatchResumable, handleResumeFrame } from './bridgeResume';
import { ipcHandlerRegistry } from './handlerRegistry';

// ─── Types ──────────────────────────────────────────────────────────────────

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: number | string;
  method: string;
  params?: unknown[];
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: number | string | null;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
  meta?: { resumeToken: string };
}

// JSON-RPC 2.0 error codes
const ERROR_PARSE = -32700;
const ERROR_INVALID_REQUEST = -32600;
const ERROR_METHOD_NOT_FOUND = -32601;

// ─── Mock IPC event ─────────────────────────────────────────────────────────

function createMockIpcEvent(): Electron.IpcMainInvokeEvent {
  const windows = getAllActiveWindows();
  const win = windows.length > 0 ? windows[0] : null;

  const senderShim = win
    ? win.webContents
    : {
        id: -1,
        getOwnerBrowserWindow: () => null,
        send: () => {},
      };

  return {
    sender: senderShim,
    processId: process.pid,
    frameId: 0,
    ports: [],
    senderFrame: null as unknown as Electron.WebFrameMain,
  } as unknown as Electron.IpcMainInvokeEvent;
}

// ─── Binary encoding ────────────────────────────────────────────────────────

function encodeForTransport(value: unknown): unknown {
  if (value === null || value === undefined) return value;

  if (Buffer.isBuffer(value)) {
    return { __type: 'Buffer', data: value.toString('base64') };
  }

  if (value instanceof Uint8Array) {
    return { __type: 'Uint8Array', data: Buffer.from(value).toString('base64') };
  }

  if (Array.isArray(value)) {
    return value.map(encodeForTransport);
  }

  if (typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      // eslint-disable-next-line security/detect-object-injection -- k from Object.entries, not user input
      result[k] = encodeForTransport(v);
    }
    return result;
  }

  return value;
}

// ─── Response helper ─────────────────────────────────────────────────────────

function sendResponse(ws: WebSocket, response: JsonRpcResponse): void {
  if (ws.readyState !== WebSocket.OPEN) return;
  try {
    ws.send(JSON.stringify(response));
  } catch (err) {
    log.error('Failed to send response:', err);
  }
}

// ─── Message parsing ─────────────────────────────────────────────────────────

function isValidJsonRpcRequest(msg: unknown): msg is JsonRpcRequest {
  if (typeof msg !== 'object' || msg === null) return false;
  const obj = msg as Record<string, unknown>;
  return (
    obj.jsonrpc === '2.0' &&
    (typeof obj.id === 'number' || typeof obj.id === 'string') &&
    typeof obj.method === 'string'
  );
}

function parseJsonRpcMessage(ws: WebSocket, raw: string): JsonRpcRequest | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    sendResponse(ws, {
      jsonrpc: '2.0',
      id: null,
      error: { code: ERROR_PARSE, message: 'Parse error: invalid JSON' },
    });
    return null;
  }
  if (!isValidJsonRpcRequest(parsed)) {
    sendResponse(ws, {
      jsonrpc: '2.0',
      id: ((parsed as Record<string, unknown>)?.id as string | number) ?? null,
      error: { code: ERROR_INVALID_REQUEST, message: 'Invalid JSON-RPC 2.0 request' },
    });
    return null;
  }
  return parsed;
}

// ─── Resume handshake ─────────────────────────────────────────────────────────

interface ResumeParams { tokens?: unknown }

function handleResume(
  ws: WebSocket,
  request: JsonRpcRequest,
  connectionMeta: MobileAccessMeta | null,
): void {
  const p = (Array.isArray(request.params) ? request.params[0] : request.params) as ResumeParams;
  const tokens = Array.isArray(p?.tokens) ? (p.tokens as string[]) : [];
  const deviceId = connectionMeta?.deviceId ?? null;
  const send = (msg: unknown) => sendResponse(ws, msg as JsonRpcResponse);
  const { resumed, lost } = handleResumeFrame(tokens, deviceId, send);
  sendResponse(ws, { jsonrpc: '2.0', id: request.id, result: { resumed, lost } });
}

// ─── Public entry point ───────────────────────────────────────────────────────

/**
 * Handles an incoming raw WebSocket message — parses JSON-RPC 2.0 and routes
 * to the handler registry, with capability gate and streaming-resume support.
 *
 * @param ws             - The WebSocket connection.
 * @param raw            - Raw message string from the client.
 * @param connectionMeta - mobileAccess metadata (Phase D) or null for legacy.
 */
export function handleJsonRpcMessage(
  ws: WebSocket,
  raw: string,
  connectionMeta: MobileAccessMeta | null = null,
): void {
  const request = parseJsonRpcMessage(ws, raw);
  if (!request) return;

  // ── Resume handshake (Phase E) ────────────────────────────────────────────
  if (request.method === 'resume') {
    handleResume(ws, request, connectionMeta);
    return;
  }

  // ── Capability gate (Phase C) ─────────────────────────────────────────────
  const proceed = enforceCapabilityOrRespond(
    request,
    connectionMeta,
    (response) => sendResponse(ws, response),
  );
  if (!proceed) return;

  const handler = ipcHandlerRegistry.get(request.method);
  if (!handler) {
    sendResponse(ws, {
      jsonrpc: '2.0',
      id: request.id,
      error: {
        code: ERROR_METHOD_NOT_FOUND,
        message: `Method not found: ${request.method}`,
        data: { availableMethods: Array.from(ipcHandlerRegistry.keys()).length },
      },
    });
    return;
  }

  // ── Dispatch (Phase E: resumable for paired-read/write on mobile) ─────────
  const ctx: DispatchContext = {
    handler,
    createEvent: createMockIpcEvent,
    encode: encodeForTransport,
    sendResponse,
  };
  dispatchResumable(ws, request, connectionMeta, ctx);
}
