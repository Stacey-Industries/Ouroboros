/**
 * approvalManager.ts — Manages pre-execution approval flow for Claude Code tool calls.
 *
 * When a pre_tool_use hook fires and the tool is in the approval-required list,
 * the hook script sends a request to the IDE and polls for a response file.
 * This module handles writing those response files and tracking pending approvals.
 *
 * Response file protocol:
 *   Path: ~/.ouroboros/approvals/{requestId}.response
 *   Content: JSON { "decision": "approve" | "reject", "reason"?: string }
 *   The hook script polls for this file at ~500ms intervals.
 */

import type { PermissionContext } from '@shared/types/permissionContext';
import fs from 'fs';
import os from 'os';
import path from 'path';

import { notifyWaiters } from './approvalWaiterRegistry';
import { getConfigValue } from './config';
import { describeFdPressure } from './fdPressureDiagnostics';
import { getPermissionContext } from './hooksLifecycleHandlers';
import log from './logger';
import { broadcastToWebClients } from './web/webServer';
import { getAllActiveWindows } from './windowManager';

export { waitForResolution } from './approvalWaiterRegistry';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ApprovalRequest {
  requestId: string;
  toolName: string;
  toolInput: Record<string, unknown>;
  sessionId: string;
  timestamp: number;
  permissionContext?: PermissionContext;
}

export interface ApprovalResponse {
  decision: 'approve' | 'reject';
  reason?: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const APPROVALS_DIR = path.join(os.homedir(), '.ouroboros', 'approvals');

// ─── Module state ────────────────────────────────────────────────────────────

/** Set of session-scoped "always allow" rules: `${sessionId}:${toolName}` */
const alwaysAllowRules = new Set<string>();

/** Pending approval requests not yet responded to */
const pendingRequests = new Map<string, ApprovalRequest>();

/** Auto-approve timers */
const autoApproveTimers = new Map<string, ReturnType<typeof setTimeout>>();

/** Deferred response writes waiting for transient descriptor pressure to clear. */
const queuedResponseWrites = new Map<
  string,
  {
    filePath: string;
    data: string;
    decision: string;
    attempt: number;
    timer: ReturnType<typeof setTimeout> | null;
    deadlineAt: number;
  }
>();

// ─── Directory management ────────────────────────────────────────────────────

async function ensureApprovalsDir(): Promise<void> {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- APPROVALS_DIR is a module constant from known path
  await fs.promises.mkdir(APPROVALS_DIR, { recursive: true });
}

function getResponseFilePath(requestId: string): string {
  return path.join(APPROVALS_DIR, `${requestId}.response`);
}

async function removeExpiredResponseFile(filePath: string, cutoff: number): Promise<void> {
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- filePath from APPROVALS_DIR listing
    const stat = await fs.promises.stat(filePath);
    if (stat.mtimeMs < cutoff) {
      await fs.promises.rm(filePath, { force: true });
    }
  } catch {
    // Ignore individual file errors
  }
}

/**
 * Clean up old response files (older than 5 minutes).
 * Called periodically to avoid accumulating stale files.
 */
async function cleanupOldResponses(): Promise<void> {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- APPROVALS_DIR is a module constant from known path
  const entries = await fs.promises.readdir(APPROVALS_DIR).catch(() => null);
  if (!entries) return;

  const cutoff = Date.now() - 5 * 60 * 1000;
  for (const file of entries) {
    if (!file.endsWith('.response')) continue;
    await removeExpiredResponseFile(path.join(APPROVALS_DIR, file), cutoff);
  }
}

// ─── Cleanup lifecycle ────────────────────────────────────────────────────────

let cleanupIntervalId: ReturnType<typeof setInterval> | null = null;

/**
 * Start the periodic cleanup of old approval response files.
 * Safe to call multiple times — only one interval will run.
 */
export function startApprovalManagerCleanup(): void {
  if (cleanupIntervalId) return; // Already running
  cleanupIntervalId = setInterval(cleanupOldResponses, 2 * 60 * 1000);
}

/**
 * Stop the periodic cleanup interval (called on app shutdown / test teardown).
 */
export function stopApprovalManagerCleanup(): void {
  if (cleanupIntervalId) {
    clearInterval(cleanupIntervalId);
    cleanupIntervalId = null;
  }

  for (const [requestId, queued] of queuedResponseWrites) {
    if (queued.timer) clearTimeout(queued.timer);
    queuedResponseWrites.delete(requestId);
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Check if a tool requires approval based on config and session-scoped rules.
 */
export function toolRequiresApproval(toolName: string, sessionId: string): boolean {
  // Check session-scoped "always allow" rules
  if (alwaysAllowRules.has(`${sessionId}:${toolName}`)) {
    return false;
  }

  const approvalRequired = getConfigValue('approvalRequired') as string[] | undefined;
  if (!approvalRequired || !Array.isArray(approvalRequired) || approvalRequired.length === 0) {
    return false;
  }

  return approvalRequired.some((pattern) => {
    // Exact match or case-insensitive match
    return pattern.toLowerCase() === toolName.toLowerCase();
  });
}

/**
 * Handle an incoming pre_tool_use event that requires approval.
 * Sends the approval request to all renderer windows and sets up auto-approve timeout.
 */
export function requestApproval(request: ApprovalRequest): void {
  // Attach enriched context cached from the earlier permission_request event (evicts on read).
  request.permissionContext = getPermissionContext(request.sessionId, request.toolName);

  pendingRequests.set(request.requestId, request);

  // Notify all renderer windows
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

  // Flash taskbar on Windows to draw attention
  for (const win of windows) {
    if (!win.isDestroyed() && !win.isFocused()) {
      win.flashFrame(true);
    }
  }

  // Set up auto-approve timeout if configured
  const timeoutSec = getConfigValue('approvalTimeout') as number | undefined;
  if (timeoutSec && timeoutSec > 0) {
    const timer = setTimeout(() => {
      if (pendingRequests.has(request.requestId)) {
        void respondToApproval(request.requestId, {
          decision: 'approve',
          reason: 'auto-approved (timeout)',
        });
      }
    }, timeoutSec * 1000);
    autoApproveTimers.set(request.requestId, timer);
  }
}

const EMFILE_MAX_RETRIES = 2;
const EMFILE_RETRY_DELAY_MS = 200;
const EMFILE_QUEUE_BASE_DELAY_MS = 500;
const EMFILE_QUEUE_MAX_DELAY_MS = 5_000;
const EMFILE_QUEUE_DEADLINE_MS = 60_000;
const EMFILE_LOG_THROTTLE_MS = 10_000;
let lastApprovalEmfileLogAt = 0;

function clearAutoApproveTimer(requestId: string): void {
  const timer = autoApproveTimers.get(requestId);
  if (timer) {
    clearTimeout(timer);
    autoApproveTimers.delete(requestId);
  }
}

async function prepareResponseFilePath(requestId: string): Promise<string | null> {
  try {
    await ensureApprovalsDir();
    return getResponseFilePath(requestId);
  } catch (err) {
    log.error(`failed to prepare response path for ${requestId}:`, err);
    return null;
  }
}

function notifyApprovalResolved(requestId: string, decision: string): void {
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

  // Resolve any pipe waiters blocked on approval.wait for this requestId.
  notifyWaiters(requestId, { decision: decision as 'approve' | 'reject' });
}

function isRetryableError(err: unknown): boolean {
  const c = (err as NodeJS.ErrnoException).code;
  return c === 'EMFILE' || c === 'ENFILE';
}

function clearQueuedResponseWrite(requestId: string): void {
  const queued = queuedResponseWrites.get(requestId);
  if (!queued) return;
  if (queued.timer) clearTimeout(queued.timer);
  queuedResponseWrites.delete(requestId);
}

function logApprovalEmfile(requestId: string, attempt: number): void {
  if (Date.now() - lastApprovalEmfileLogAt < EMFILE_LOG_THROTTLE_MS) return;
  lastApprovalEmfileLogAt = Date.now();
  log.warn(`[approval] EMFILE while writing ${requestId} (attempt ${attempt}) — ${describeFdPressure()}`);
}

interface WriteScheduleOptions {
  filePath: string;
  data: string;
  decision: string;
  attempt: number;
  deadlineAt: number;
}

function scheduleQueuedResponseWrite(requestId: string, opts: WriteScheduleOptions): void {
  clearQueuedResponseWrite(requestId);

  const { filePath, data, decision, attempt, deadlineAt } = opts;
  const delay = Math.min(
    EMFILE_QUEUE_BASE_DELAY_MS * 2 ** Math.max(attempt - 1, 0),
    EMFILE_QUEUE_MAX_DELAY_MS,
  );
  const queued = {
    filePath,
    data,
    decision,
    attempt,
    timer: null as ReturnType<typeof setTimeout> | null,
    deadlineAt,
  };

  queued.timer = setTimeout(() => {
    const current = queuedResponseWrites.get(requestId);
    if (!current) return;
    current.timer = null;
    void writeResponseWithRetry(requestId, current.decision, {
      filePath: current.filePath,
      data: current.data,
      queuedAttempt: current.attempt,
      deadlineAt: current.deadlineAt,
    });
  }, delay);

  queuedResponseWrites.set(requestId, queued);
}

interface WriteRetryOptions {
  filePath: string;
  data: string;
  queuedAttempt?: number;
  deadlineAt?: number;
}

async function attemptFileWrite(
  requestId: string,
  decision: string,
  opts: Required<Pick<WriteRetryOptions, 'filePath' | 'data'>>,
  queuedAttempt: number,
): Promise<{ success: boolean; lastError: unknown }> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= EMFILE_MAX_RETRIES; attempt++) {
    try {
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- filePath from APPROVALS_DIR + requestId
      await fs.promises.writeFile(opts.filePath, opts.data, 'utf8');
      clearQueuedResponseWrite(requestId);
      const retrySuffix =
        queuedAttempt > 0 || attempt > 0 ? ` (retry ${queuedAttempt + attempt})` : '';
      log.debug(`wrote response for ${requestId}: ${decision}${retrySuffix}`);
      notifyApprovalResolved(requestId, decision);
      return { success: true, lastError: undefined };
    } catch (err) {
      lastError = err;
      if (!isRetryableError(err)) break;
      logApprovalEmfile(requestId, queuedAttempt + attempt + 1);
      await new Promise<void>((r) => setTimeout(r, EMFILE_RETRY_DELAY_MS));
    }
  }
  return { success: false, lastError };
}

async function writeResponseWithRetry(
  requestId: string,
  decision: string,
  opts: WriteRetryOptions,
): Promise<boolean> {
  const queuedAttempt = opts.queuedAttempt ?? 0;
  const deadlineAt = opts.deadlineAt ?? Date.now() + EMFILE_QUEUE_DEADLINE_MS;
  const { success, lastError } = await attemptFileWrite(
    requestId,
    decision,
    { filePath: opts.filePath, data: opts.data },
    queuedAttempt,
  );
  if (success) return true;

  if (isRetryableError(lastError) && Date.now() < deadlineAt) {
    scheduleQueuedResponseWrite(requestId, {
      filePath: opts.filePath,
      data: opts.data,
      decision,
      attempt: queuedAttempt + EMFILE_MAX_RETRIES + 1,
      deadlineAt,
    });
    return true;
  }

  clearQueuedResponseWrite(requestId);
  log.error(`failed to write response file for ${requestId}:`, lastError);
  return false;
}

/**
 * Write an approval response file so the hook script can pick it up.
 */
export async function respondToApproval(
  requestId: string,
  response: ApprovalResponse,
): Promise<boolean> {
  clearAutoApproveTimer(requestId);
  clearQueuedResponseWrite(requestId);

  const filePath = await prepareResponseFilePath(requestId);
  if (!filePath) return false;

  const written = await writeResponseWithRetry(requestId, response.decision, {
    filePath,
    data: JSON.stringify(response),
  });

  if (written) {
    pendingRequests.delete(requestId);
  }

  return written;
}

/**
 * Add a session-scoped "always allow" rule for a tool.
 */
export function addAlwaysAllowRule(sessionId: string, toolName: string): void {
  alwaysAllowRules.add(`${sessionId}:${toolName}`);
  log.info(`always-allow rule added: ${sessionId}:${toolName}`);
}

/**
 * Clear all session-scoped rules for a session (called when session ends).
 */
export function clearSessionRules(sessionId: string): void {
  for (const key of alwaysAllowRules) {
    if (key.startsWith(`${sessionId}:`)) {
      alwaysAllowRules.delete(key);
    }
  }
}

/**
 * Get the approvals directory path (used by hook scripts).
 * Directory is created lazily on first approval response write.
 */
export function getApprovalsDir(): string {
  return APPROVALS_DIR;
}

/**
 * Get all pending approval requests.
 */
export function getPendingRequests(): ApprovalRequest[] {
  return Array.from(pendingRequests.values());
}

// waitForResolution is re-exported from approvalWaiterRegistry at the top of this file.
