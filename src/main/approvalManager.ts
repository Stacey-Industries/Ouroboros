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

import fs from 'fs'
import os from 'os'
import path from 'path'

import { getConfigValue } from './config'
import { broadcastToWebClients } from './web/webServer'
import { getAllActiveWindows } from './windowManager'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ApprovalRequest {
  requestId: string
  toolName: string
  toolInput: Record<string, unknown>
  sessionId: string
  timestamp: number
}

export interface ApprovalResponse {
  decision: 'approve' | 'reject'
  reason?: string
}

// ─── Constants ───────────────────────────────────────────────────────────────

const APPROVALS_DIR = path.join(os.homedir(), '.ouroboros', 'approvals')

// ─── Module state ────────────────────────────────────────────────────────────

/** Set of session-scoped "always allow" rules: `${sessionId}:${toolName}` */
const alwaysAllowRules = new Set<string>()

/** Pending approval requests not yet responded to */
const pendingRequests = new Map<string, ApprovalRequest>()

/** Auto-approve timers */
const autoApproveTimers = new Map<string, ReturnType<typeof setTimeout>>()

// ─── Directory management ────────────────────────────────────────────────────

function ensureApprovalsDir(): void {
  if (!fs.existsSync(APPROVALS_DIR)) {
    fs.mkdirSync(APPROVALS_DIR, { recursive: true })
  }
}

function getResponseFilePath(requestId: string): string {
  return path.join(APPROVALS_DIR, `${requestId}.response`)
}

function removeExpiredResponseFile(filePath: string, cutoff: number): void {
  try {
    const stat = fs.statSync(filePath)
    if (stat.mtimeMs < cutoff) {
      fs.rmSync(filePath, { force: true })
    }
  } catch {
    // Ignore individual file errors
  }
}

/**
 * Clean up old response files (older than 5 minutes).
 * Called periodically to avoid accumulating stale files.
 */
function cleanupOldResponses(): void {
  try {
    if (!fs.existsSync(APPROVALS_DIR)) return

    const files = fs.readdirSync(APPROVALS_DIR)
    const cutoff = Date.now() - 5 * 60 * 1000

    for (const file of files) {
      if (!file.endsWith('.response')) continue
      removeExpiredResponseFile(path.join(APPROVALS_DIR, file), cutoff)
    }
  } catch {
    // Non-critical — ignore
  }
}

// ─── Cleanup lifecycle ────────────────────────────────────────────────────────

let cleanupIntervalId: ReturnType<typeof setInterval> | null = null

/**
 * Start the periodic cleanup of old approval response files.
 * Safe to call multiple times — only one interval will run.
 */
export function startApprovalManagerCleanup(): void {
  if (cleanupIntervalId) return // Already running
  cleanupIntervalId = setInterval(cleanupOldResponses, 2 * 60 * 1000)
}

/**
 * Stop the periodic cleanup interval (called on app shutdown / test teardown).
 */
export function stopApprovalManagerCleanup(): void {
  if (cleanupIntervalId) {
    clearInterval(cleanupIntervalId)
    cleanupIntervalId = null
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Check if a tool requires approval based on config and session-scoped rules.
 */
export function toolRequiresApproval(toolName: string, sessionId: string): boolean {
  // Check session-scoped "always allow" rules
  if (alwaysAllowRules.has(`${sessionId}:${toolName}`)) {
    return false
  }

  const approvalRequired = getConfigValue('approvalRequired') as string[] | undefined
  if (!approvalRequired || !Array.isArray(approvalRequired) || approvalRequired.length === 0) {
    return false
  }

  return approvalRequired.some((pattern) => {
    // Exact match or case-insensitive match
    return pattern.toLowerCase() === toolName.toLowerCase()
  })
}

/**
 * Handle an incoming pre_tool_use event that requires approval.
 * Sends the approval request to all renderer windows and sets up auto-approve timeout.
 */
export function requestApproval(request: ApprovalRequest): void {
  pendingRequests.set(request.requestId, request)

  // Notify all renderer windows
  const windows = getAllActiveWindows()
  for (const win of windows) {
    if (!win.isDestroyed()) {
      win.webContents.send('approval:request', request)
    }
  }
  broadcastToWebClients('approval:request', request)

  // Flash taskbar on Windows to draw attention
  for (const win of windows) {
    if (!win.isDestroyed() && !win.isFocused()) {
      win.flashFrame(true)
    }
  }

  // Set up auto-approve timeout if configured
  const timeoutSec = getConfigValue('approvalTimeout') as number | undefined
  if (timeoutSec && timeoutSec > 0) {
    const timer = setTimeout(() => {
      if (pendingRequests.has(request.requestId)) {
        respondToApproval(request.requestId, { decision: 'approve', reason: 'auto-approved (timeout)' })
      }
    }, timeoutSec * 1000)
    autoApproveTimers.set(request.requestId, timer)
  }
}

/**
 * Synchronous sleep using SharedArrayBuffer + Atomics.wait.
 * Only used for EMFILE retry — keeps respondToApproval synchronous
 * so callers don't need to change.
 */
function sleepSync(ms: number): void {
  const buf = new SharedArrayBuffer(4)
  Atomics.wait(new Int32Array(buf), 0, 0, ms)
}

const EMFILE_MAX_RETRIES = 2
const EMFILE_RETRY_DELAY_MS = 200

/**
 * Write an approval response file so the hook script can pick it up.
 */
export function respondToApproval(requestId: string, response: ApprovalResponse): boolean {
  // Clean up tracking state
  pendingRequests.delete(requestId)

  const timer = autoApproveTimers.get(requestId)
  if (timer) {
    clearTimeout(timer)
    autoApproveTimers.delete(requestId)
  }

  // Write the response file (with EMFILE retry)
  const data = JSON.stringify(response)
  let filePath: string
  try {
    ensureApprovalsDir()
    filePath = getResponseFilePath(requestId)
  } catch (err) {
    console.error(`[approval] failed to prepare response path for ${requestId}:`, err)
    return false
  }

  let lastError: unknown
  for (let attempt = 0; attempt <= EMFILE_MAX_RETRIES; attempt++) {
    try {
      fs.writeFileSync(filePath, data, 'utf8')
      console.log(`[approval] wrote response for ${requestId}: ${response.decision}${attempt > 0 ? ` (retry ${attempt})` : ''}`)

      // Notify renderer windows that this approval was resolved
      const windows = getAllActiveWindows()
      for (const win of windows) {
        if (!win.isDestroyed()) {
          win.webContents.send('approval:resolved', { requestId, decision: response.decision })
        }
      }
      broadcastToWebClients('approval:resolved', { requestId, decision: response.decision })

      return true
    } catch (err) {
      lastError = err
      const code = (err as NodeJS.ErrnoException).code
      if (code === 'EMFILE' || code === 'ENFILE') {
        console.warn(`[approval] ${code} on attempt ${attempt + 1} for ${requestId} — retrying in ${EMFILE_RETRY_DELAY_MS}ms`)
        sleepSync(EMFILE_RETRY_DELAY_MS)
        continue
      }
      // Non-EMFILE errors fail immediately
      break
    }
  }

  console.error(`[approval] failed to write response file for ${requestId}:`, lastError)
  return false
}

/**
 * Add a session-scoped "always allow" rule for a tool.
 */
export function addAlwaysAllowRule(sessionId: string, toolName: string): void {
  alwaysAllowRules.add(`${sessionId}:${toolName}`)
  console.log(`[approval] always-allow rule added: ${sessionId}:${toolName}`)
}

/**
 * Clear all session-scoped rules for a session (called when session ends).
 */
export function clearSessionRules(sessionId: string): void {
  for (const key of alwaysAllowRules) {
    if (key.startsWith(`${sessionId}:`)) {
      alwaysAllowRules.delete(key)
    }
  }
}

/**
 * Get the approvals directory path (used by hook scripts).
 */
export function getApprovalsDir(): string {
  ensureApprovalsDir()
  return APPROVALS_DIR
}

/**
 * Get all pending approval requests.
 */
export function getPendingRequests(): ApprovalRequest[] {
  return Array.from(pendingRequests.values())
}
