/**
 * extensionHostProtocol.ts — IPC message protocol between main process and
 * the ExtensionHost utility process.
 *
 * Phase 5 (MVP) scope: activate, deactivate, dispatchEvent + push events for
 * extension log lines, errors, ui notifications. Sandbox APIs config.get and
 * ui.showNotification are usable. Files / terminal / commands come in Phase 6.
 */

import type { ExtensionManifest } from '../extensionsTypes';

/** Pre-loaded extension package sent to the host for activation. */
export interface ExtensionPackage {
  manifest: ExtensionManifest;
  /** Source code of the extension's main file, pre-read by main */
  code: string;
  /** Sanitized config snapshot — extension reads from this via config.get */
  configSnapshot: Record<string, unknown>;
}

// ── Main → Host: requests ──

export type ExtensionHostRequest =
  | { type: 'activate'; requestId: string; package: ExtensionPackage }
  | { type: 'deactivate'; requestId: string; name: string }
  | { type: 'dispatchEvent'; eventName: string; context?: Record<string, unknown> }
  | { type: 'updateConfigSnapshot'; name: string; configSnapshot: Record<string, unknown> }
  /** Response to a Host→Main apiCall — resolves a pending Promise inside the host */
  | { type: 'apiResponse'; callId: string; result: unknown }
  /** Error response to a Host→Main apiCall — rejects a pending Promise inside the host */
  | { type: 'apiError'; callId: string; message: string };

// ── Host → Main: responses (correlated by requestId) ──

export type ExtensionHostResponse =
  | { type: 'activated'; requestId: string; name: string }
  | { type: 'deactivated'; requestId: string; name: string }
  | { type: 'error'; requestId: string; message: string };

// ── Host → Main: push events ──

export type ExtensionHostEvent =
  /** Extension wrote to console / logged via the sandbox proxy */
  | { type: 'extensionLog'; name: string; message: string }
  /** Extension threw or otherwise failed during activation */
  | { type: 'extensionError'; name: string; message: string }
  /** Extension status transition (active / inactive / error) */
  | { type: 'extensionStatus'; name: string; status: 'active' | 'inactive' | 'error'; errorMessage?: string }
  /** ouroboros.ui.showNotification call from inside the sandbox */
  | { type: 'uiNotification'; extensionName: string; message: string }
  /** Host requests a main-process API operation (files / terminal). Awaits apiResponse/apiError. */
  | {
      type: 'apiCall'; callId: string; extName: string;
      namespace: 'files' | 'terminal'; method: string; args: unknown[];
    }
  /** Notification that an extension registered a command (handler stays in host) */
  | { type: 'commandRegistered'; extensionName: string; commandId: string }
  /** Notification that an extension unregistered a command */
  | { type: 'commandUnregistered'; extensionName: string; commandId: string };

// ── Outbound discriminated union ──

export type ExtensionHostOutbound = ExtensionHostResponse | ExtensionHostEvent;

// Type guards
//
// Responses correlate to requests via requestId. Events are everything else
// (push notifications and host-originated apiCall/command events).

const RESPONSE_TYPES = new Set(['activated', 'deactivated', 'error']);

export function isResponse(msg: ExtensionHostOutbound): msg is ExtensionHostResponse {
  return RESPONSE_TYPES.has(msg.type);
}

export function isEvent(msg: ExtensionHostOutbound): msg is ExtensionHostEvent {
  return !RESPONSE_TYPES.has(msg.type);
}
