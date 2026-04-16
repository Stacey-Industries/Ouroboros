/**
 * approvalManagerHelpers.ts — Broadcast and timeout helpers for approvalManager.
 *
 * Extracted to keep approvalManager.ts under the 300-line ESLint limit.
 */

import type { ApprovalRequest } from './approvalManager';
import { getConfigValue } from './config';
import { broadcastToWebClients } from './web/webServer';
import { getAllActiveWindows } from './windowManager';

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
