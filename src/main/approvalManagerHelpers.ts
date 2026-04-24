/**
 * approvalManagerHelpers.ts — Broadcast and timeout helpers for approvalManager.
 *
 * Extracted to keep approvalManager.ts under the 300-line ESLint limit.
 */

import type { ApprovalRequest } from './approvalManager';
import { notifyWaiters } from './approvalWaiterRegistry';
import { getConfigValue } from './config';
import { broadcastToWebClients } from './web/webServer';
import { getAllActiveWindows } from './windowManager';

/**
 * Notify all active windows and web clients that an approval request was resolved.
 * Also unblocks any pipe waiters blocked on this requestId.
 */
export function notifyApprovalResolved(requestId: string, decision: string): void {
  const windows = getAllActiveWindows();
  for (const win of windows) {
    if (!win.isDestroyed()) {
      try {
        // Use mainFrame.send directly — webContents.send logs internally before
        // rethrowing when the render frame is disposed during HMR/navigation.
        win.webContents.mainFrame.send('approval:resolved', { requestId, decision });
      } catch {
        // Render frame disposed — silently skip this window
      }
    }
  }
  broadcastToWebClients('approval:resolved', { requestId, decision });
  notifyWaiters(requestId, { decision: decision as 'approve' | 'reject' });
}

/**
 * Check if a tool requires approval based on config and session-scoped rules.
 * Note: does NOT check session-scoped always-allow rules — that check lives in
 * approvalManager.ts where the alwaysAllowRules Set is held.
 */
export function toolRequiresApprovalFromConfig(toolName: string): boolean {
  const approvalRequired = getConfigValue('approvalRequired') as string[] | undefined;
  if (!approvalRequired || !Array.isArray(approvalRequired) || approvalRequired.length === 0) {
    return false;
  }
  return approvalRequired.some((pattern) => pattern.toLowerCase() === toolName.toLowerCase());
}

/**
 * Derive a stable command key from a tool-input record.
 * Used as the identity for approval-memory hashing.
 */
export function getCommandKey(toolName: string, toolInput: Record<string, unknown>): string {
  if (toolName === 'Bash') return String(toolInput.command ?? '');
  const filePath = toolInput.file_path ?? toolInput.path;
  return filePath !== undefined ? String(filePath) : JSON.stringify(toolInput);
}

/**
 * Send an approval:request event to all active renderer windows and web clients,
 * then flash the taskbar if the window is unfocused (Windows).
 */
export function broadcastApprovalRequest(request: ApprovalRequest): void {
  const windows = getAllActiveWindows();
  for (const win of windows) {
    if (!win.isDestroyed()) {
      try {
        win.webContents.mainFrame.send('approval:request', request);
      } catch {
        // Render frame disposed — silently skip this window
      }
    }
  }
  broadcastToWebClients('approval:request', request);
  for (const win of windows) {
    if (!win.isDestroyed() && !win.isFocused()) win.flashFrame(true);
  }
}

type RespondFn = (
  requestId: string,
  response: { decision: 'approve' | 'reject'; reason?: string },
) => Promise<boolean>;

/**
 * Set up an auto-approve timeout if `approvalTimeout` config is > 0.
 * Returns the timer ID, or null if no timeout is configured.
 */
export function scheduleAutoApproveTimeout(
  request: ApprovalRequest,
  pendingHas: (id: string) => boolean,
  respond: RespondFn,
): ReturnType<typeof setTimeout> | null {
  const timeoutSec = getConfigValue('approvalTimeout') as number | undefined;
  if (!timeoutSec || timeoutSec <= 0) return null;
  return setTimeout(() => {
    if (pendingHas(request.requestId)) {
      void respond(request.requestId, {
        decision: 'approve',
        reason: 'auto-approved (timeout)',
      });
    }
  }, timeoutSec * 1000);
}
