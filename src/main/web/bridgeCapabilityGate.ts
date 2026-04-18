/**
 * bridgeCapabilityGate.ts — WebSocket bridge seam for capability enforcement.
 *
 * Wave 33a Phase C.
 *
 * Exports enforceCapabilityOrRespond(), called by webSocketBridge.ts before
 * dispatching any handler. Returns true if the request should proceed,
 * false if it was rejected (and a JSON-RPC error was already sent).
 *
 * PHASE D NOTE: When Phase D lands, it must:
 *  1. Tag authenticated WS connections with MobileAccessMeta via the upgrade
 *     handshake (refresh-token verification path).
 *  2. Remove the `if (!connectionMeta)` early-return fallback below — at that
 *     point ALL connections must carry metadata, including legacy desktop ones
 *     (which will have capabilities: ['paired-read','paired-write','desktop-only']).
 */

import log from '../logger';
import { checkCapability } from '../mobileAccess/capabilityGate';
import type { Capability } from '../mobileAccess/types';

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Per-connection metadata tagged by Phase D's WS upgrade handshake.
 * Only present on mobile-authenticated connections. Desktop connections
 * that went through legacy single-token auth have no metadata object.
 */
export interface MobileAccessMeta {
  deviceId: string;
  capabilities: readonly Capability[];
  issuedAt: number;
}

/** Minimal JSON-RPC request surface needed for the gate check. */
export interface GatableRequest {
  id: number | string;
  method: string;
}

/** Send function signature matching webSocketBridge's sendResponse helper. */
export type SendFn = (response: {
  jsonrpc: '2.0';
  id: number | string;
  error: { code: number; message: string };
}) => void;

// ─── Error code ───────────────────────────────────────────────────────────────

/** JSON-RPC application error code for capability denial. */
const ERROR_CAPABILITY_DENIED = -32003;

// ─── Gate function ────────────────────────────────────────────────────────────

/**
 * Check whether the request's channel is permitted for the connection's
 * capability set. If denied, sends the JSON-RPC error response and returns
 * false. If allowed (or the connection has no mobileAccess metadata), returns
 * true so the caller proceeds with normal dispatch.
 *
 * @param req          - Parsed JSON-RPC request (id + method/channel).
 * @param connectionMeta - mobileAccess metadata on the WS connection, or null
 *                        for legacy desktop connections (Phase D not yet wired).
 * @param send         - Function that serialises and sends a JSON-RPC response.
 * @returns true if the request should proceed; false if it was rejected.
 */
export function enforceCapabilityOrRespond(
  req: GatableRequest,
  connectionMeta: MobileAccessMeta | null,
  send: SendFn,
): boolean {
  // PHASE D FALLBACK: connections with no mobileAccess tag are legacy desktop
  // sessions authenticated via the single process-wide webAccessToken.
  // Skip the gate entirely to preserve backwards compatibility until Phase D
  // removes this path and tags every connection with MobileAccessMeta.
  if (!connectionMeta) return true;

  const result = checkCapability({
    channel: req.method,
    deviceCapabilities: connectionMeta.capabilities,
  });

  if (result.allowed) return true;

  const reason = result.reason ?? 'capability-denied';
  log.warn(
    `[capabilityGate] denied deviceId=${connectionMeta.deviceId}`,
    `channel=${req.method} reason=${reason}`,
  );

  send({
    jsonrpc: '2.0',
    id: req.id,
    error: { code: ERROR_CAPABILITY_DENIED, message: reason },
  });

  return false;
}
