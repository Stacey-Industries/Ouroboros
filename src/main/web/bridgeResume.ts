/**
 * bridgeResume.ts — Resume-handshake helpers and resumable-dispatch wrapper.
 *
 * Wave 33a Phase E.
 *
 * Extracted from webSocketBridge.ts to keep that file under 300 lines.
 *
 * Server-side contract:
 *  1. For resumable channels (paired-read / paired-write), dispatchResumable()
 *     registers a resumeToken, emits a meta frame to the client, then awaits
 *     the handler. On settle it calls inflightRegistry.resolve() and sends the
 *     final result/error frame via the registry's current send target (which
 *     may have been reattached to a new socket since the call started).
 *
 *  2. handleResumeFrame() processes the first-frame resume handshake sent by
 *     the client: { method: 'resume', params: { tokens: string[] } }.
 *     Returns { resumed, lost } for the ack frame.
 *
 *  3. detachDevice() detaches all in-flight calls for a device on WS close.
 *
 * Legacy desktop connections (connectionMeta === null) bypass resume entirely —
 * no meta frame is emitted and dispatchResumable falls through to plain dispatch.
 */

import { WebSocket } from 'ws';

import log from '../logger';
import { CATALOG_LOOKUP } from '../mobileAccess/channelCatalog';
import type { MobileAccessMeta } from './bridgeCapabilityGate';
import {
  detach,
  getSend,
  getTokensForDevice,
  reattach,
  register,
  resolve,
  setSendTarget,
} from './inflightRegistry';

// ─── Types ────────────────────────────────────────────────────────────────────

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
  error?: { code: number; message: string; data?: unknown };
  meta?: { resumeToken: string };
}

export type HandlerFn = (
  event: Electron.IpcMainInvokeEvent,
  ...args: unknown[]
) => unknown;

export type SendResponseFn = (ws: WebSocket, response: JsonRpcResponse) => void;

export type CreateMockEventFn = () => Electron.IpcMainInvokeEvent;

export type EncodeForTransportFn = (value: unknown) => unknown;

/** Grouped dispatch dependencies — avoids exceeding max-params:4. */
export interface DispatchContext {
  handler: HandlerFn;
  createEvent: CreateMockEventFn;
  encode: EncodeForTransportFn;
  sendResponse: SendResponseFn;
}

// ─── Resumability check ───────────────────────────────────────────────────────

function isResumableChannel(channel: string): boolean {
  const entry = CATALOG_LOOKUP.get(channel);
  return entry?.class === 'paired-read' || entry?.class === 'paired-write';
}

// ─── Resume-handshake frame ───────────────────────────────────────────────────

/**
 * Validate and process the { method:'resume', params:{ tokens } } frame sent
 * by the client as its FIRST message after reconnect.
 *
 * @returns { resumed, lost } token lists for the ack frame.
 */
export function handleResumeFrame(
  tokens: string[],
  deviceId: string | null,
  send: (msg: unknown) => void,
): { resumed: string[]; lost: string[] } {
  if (!deviceId) return { resumed: [], lost: tokens };

  const resumed: string[] = [];
  const lost: string[] = [];

  for (const token of tokens) {
    if (reattach(token, deviceId, send)) {
      resumed.push(token);
    } else {
      lost.push(token);
    }
  }

  log.info(
    `[bridgeResume] resume handshake device=${deviceId}`,
    `resumed=${resumed.length} lost=${lost.length}`,
  );
  return { resumed, lost };
}

// ─── Detach all for device ────────────────────────────────────────────────────

/**
 * Detaches all in-flight resumable calls for a device on WS close.
 * The handler promises keep running; responses queue until reattach or TTL.
 */
export function detachDevice(deviceId: string): void {
  const tokens = getTokensForDevice(deviceId);
  for (const token of tokens) detach(token);
  if (tokens.length > 0) {
    log.info(`[bridgeResume] detached ${tokens.length} token(s) for device=${deviceId}`);
  }
}

// ─── Internal dispatch helpers ────────────────────────────────────────────────

function sendViaRegistry(
  token: string,
  fallbackWs: WebSocket,
  ctx: DispatchContext,
  msg: JsonRpcResponse,
): void {
  const fn = getSend(token);
  if (fn) {
    fn(msg);
  } else {
    try { ctx.sendResponse(fallbackWs, msg); } catch { /* ws closed */ }
  }
}

function runHandler(
  ws: WebSocket,
  request: JsonRpcRequest,
  ctx: DispatchContext,
): void {
  const mockEvent = ctx.createEvent();
  const params = Array.isArray(request.params) ? request.params : [];
  Promise.resolve()
    .then(() => ctx.handler(mockEvent, ...params))
    .then((result: unknown) => {
      ctx.sendResponse(ws, { jsonrpc: '2.0', id: request.id, result: ctx.encode(result) });
    })
    .catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      ctx.sendResponse(ws, {
        jsonrpc: '2.0', id: request.id,
        error: { code: -32603, message: `Handler error: ${message}` },
      });
    });
}

function runResumableHandler(
  ws: WebSocket,
  request: JsonRpcRequest,
  token: string,
  ctx: DispatchContext,
): void {
  const mockEvent = ctx.createEvent();
  const params = Array.isArray(request.params) ? request.params : [];
  Promise.resolve()
    .then(() => ctx.handler(mockEvent, ...params))
    .then((result: unknown) => {
      sendViaRegistry(token, ws, ctx, {
        jsonrpc: '2.0', id: request.id, result: ctx.encode(result),
      });
      resolve(token);
    })
    .catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      sendViaRegistry(token, ws, ctx, {
        jsonrpc: '2.0', id: request.id,
        error: { code: -32603, message: `Handler error: ${message}` },
      });
      resolve(token);
    });
}

// ─── Public dispatch ──────────────────────────────────────────────────────────

/**
 * Dispatch a handler, wrapping with resume registration for resumable channels
 * on mobile connections. Falls back to plain dispatch for:
 *  - Legacy desktop connections (connectionMeta === null)
 *  - Non-resumable channel classes (always / desktop-only)
 *
 * @param ws             - The WebSocket connection for this request.
 * @param request        - Parsed JSON-RPC 2.0 request.
 * @param connectionMeta - mobileAccess metadata or null for legacy desktop.
 * @param ctx            - Grouped dispatch dependencies (handler, encode, etc.).
 */
export function dispatchResumable(
  ws: WebSocket,
  request: JsonRpcRequest,
  connectionMeta: MobileAccessMeta | null,
  ctx: DispatchContext,
): void {
  const shouldResume = connectionMeta !== null && isResumableChannel(request.method);
  if (!shouldResume) {
    runHandler(ws, request, ctx);
    return;
  }

  const token = register({ deviceId: connectionMeta.deviceId, channel: request.method });
  setSendTarget(token, (msg) => {
    try { ctx.sendResponse(ws, msg as JsonRpcResponse); } catch { /* ws closed */ }
  });

  // Meta frame — client moves request from pendingRequests → resumableRequests
  ctx.sendResponse(ws, { jsonrpc: '2.0', id: request.id, meta: { resumeToken: token } });

  runResumableHandler(ws, request, token, ctx);
}
