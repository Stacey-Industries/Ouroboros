/**
 * hooksLifecycleHandlers.ts — Handlers for new Claude Code hook lifecycle events.
 *
 * Extracted from hooks.ts to keep that file under the 300-line ESLint limit.
 * Also owns HookEventType to avoid a circular dependency with hooks.ts.
 *
 * Handles: cwd_changed, file_changed, config_change, permission_request,
 * permission_denied, and all other pass-through events added in Phase 0.
 */

import type { PermissionContext } from '@shared/types/permissionContext';

import { getGraphController } from './codebaseGraph/graphControllerSupport';
import { getContextLayerController } from './contextLayer/contextLayerController';
import log from './logger';
import { getEditProvenanceStore } from './orchestration/editProvenance';

// ---------------------------------------------------------------------------
// Permission context cache — keyed by `sessionId:toolName`.
// Written by enrichFromPermissionRequest (permission_request event) and read
// by approvalManager.requestApproval (pre_tool_use event, fires later).
// Eviction is lookup-on-read: getPermissionContext deletes after returning.
// ---------------------------------------------------------------------------

const permissionContextCache = new Map<string, PermissionContext>();

function cacheKey(sessionId: string, toolName: string): string {
  return `${sessionId}:${toolName}`;
}

export function getPermissionContext(
  sessionId: string,
  toolName: string,
): PermissionContext | undefined {
  const key = cacheKey(sessionId, toolName);
  const value = permissionContextCache.get(key);
  if (value !== undefined) {
    permissionContextCache.delete(key);
  }
  return value;
}

export function clearPermissionContext(sessionId: string, toolName: string): void {
  permissionContextCache.delete(cacheKey(sessionId, toolName));
}

// ---------------------------------------------------------------------------
// HookEventType — canonical union of all wire-format event names.
// Defined here (not in hooks.ts) to avoid a circular dependency since
// hooks.ts imports handlers from this file.
// ---------------------------------------------------------------------------

export type HookEventType =
  // Tools
  | 'pre_tool_use'
  | 'post_tool_use'
  | 'post_tool_use_failure'
  // Agents
  | 'agent_start'
  | 'agent_stop'
  | 'agent_end'
  | 'teammate_idle'
  // Sessions / lifecycle
  | 'session_start'
  | 'session_end'
  | 'session_stop'
  | 'stop_failure'
  | 'setup'
  // Tasks
  | 'task_created'
  | 'task_completed'
  // Conversation
  | 'user_prompt_submit'
  | 'elicitation'
  | 'elicitation_result'
  | 'notification'
  // Workspace
  | 'cwd_changed'
  | 'file_changed'
  | 'worktree_create'
  | 'worktree_remove'
  | 'config_change'
  // Context
  | 'pre_compact'
  | 'post_compact'
  | 'instructions_loaded'
  // Permissions
  | 'permission_request'
  | 'permission_denied';

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/**
 * Handle a cwd_changed event: update the session→cwd registry and notify
 * the context layer so it can re-scope if the working directory changed.
 */
export function handleCwdChanged(
  sessionCwdMap: Map<string, string>,
  payload: { sessionId: string; cwd?: string; data?: Record<string, unknown> },
): void {
  const newCwd = (payload.data?.['cwd'] as string | undefined) ?? payload.cwd;
  if (!newCwd) return;
  sessionCwdMap.set(payload.sessionId, newCwd);
  log.info(`[hooks] cwd_changed session=${payload.sessionId} cwd=${newCwd}`);
  getContextLayerController()?.onCwdChanged?.(newCwd);
}

/**
 * Handle a file_changed event: notify the context layer and graph controller
 * that files may have changed on disk (lighter signal than onGitCommit).
 * Also marks user edits for provenance tracking when no recent agent edit exists.
 */
export function handleFileChanged(
  payload: { internal?: boolean; data?: Record<string, unknown> },
): void {
  if (payload.internal) return;
  getContextLayerController()?.onFileChanged?.();
  getGraphController()?.onFileChange?.([]);
  const filePath = payload.data?.['file'] as string | undefined;
  if (filePath) {
    setImmediate(() => {
      try {
        getEditProvenanceStore()?.markUserEdit(filePath);
      } catch (err) {
        log.warn('[editProvenance] markUserEdit error:', err);
      }
    });
  }
}

/**
 * Log a config_change event. No main-process side effects — the renderer
 * handles config changes by re-reading via IPC.
 */
export function handleConfigChange(sessionId: string): void {
  log.info(`[hooks] config_change session=${sessionId}`);
}

/**
 * Cache permission context from a permission_request event so the approval
 * dialog can display richer information than what comes through pre_tool_use.
 * The cache entry is evicted on first read by getPermissionContext.
 */
export function enrichFromPermissionRequest(payload: {
  sessionId: string;
  data?: Record<string, unknown>;
  toolName?: string;
}): void {
  const permissionType = payload.data?.['permissionType'] as string | undefined;
  const matchedRule = payload.data?.['matchedRule'] as string | undefined;
  const toolName = payload.toolName ?? '';

  log.info(
    `[hooks] permission_request session=${payload.sessionId}` +
      ` tool=${toolName || 'unknown'}` +
      ` permissionType=${permissionType ?? 'unknown'}`,
  );

  const context: PermissionContext = {
    ...(permissionType !== undefined && { permissionType }),
    ...(matchedRule !== undefined && { matchedRule }),
    rawData: payload.data,
  };
  permissionContextCache.set(cacheKey(payload.sessionId, toolName), context);
}
