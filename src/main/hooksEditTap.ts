/**
 * hooksEditTap.ts — Hook pipeline taps for post-tool-use Edit/Write/MultiEdit events.
 *
 * Handles conflict monitor recording and edit provenance tracking.
 * Extracted from hooks.ts to stay under the 300-line ESLint limit.
 * Called from dispatchToRenderer and dispatchSyntheticHookEvent in hooks.ts.
 */

import { getConflictMonitor } from './agentConflict/conflictMonitor';
import type { HookPayload } from './hooks';
import log from './logger';
import { getEditProvenanceStore } from './orchestration/editProvenance';

const EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit']);

function getFilePathFromInput(payload: HookPayload): string | undefined {
  const input = payload.input as Record<string, unknown> | undefined;
  return input?.file_path as string | undefined ?? input?.path as string | undefined;
}

function isPostEditEvent(payload: HookPayload): boolean {
  return (
    payload.type === 'post_tool_use' &&
    !!payload.toolName &&
    EDIT_TOOLS.has(payload.toolName)
  );
}

export function tapConflictMonitor(
  payload: HookPayload,
  sessionCwdMap: Map<string, string>,
): void {
  if (!isPostEditEvent(payload)) return;
  const filePath = getFilePathFromInput(payload);
  if (!filePath) return;
  const cwd = sessionCwdMap.get(payload.sessionId) ?? '';
  log.info(
    `[trace:conflict] emission session=${payload.sessionId} tool=${payload.toolName} file=${filePath}`,
  );
  // Detach from hook pipe response — must not block the named-pipe handler
  setImmediate(() => {
    try {
      getConflictMonitor().recordEdit(cwd, payload.sessionId, filePath);
    } catch (err) {
      log.warn('[conflictMonitor] recordEdit error:', err);
    }
  });
}

export function tapEditProvenance(payload: HookPayload): void {
  if (!isPostEditEvent(payload)) return;
  const filePath = getFilePathFromInput(payload);
  if (!filePath) return;
  setImmediate(() => {
    try {
      getEditProvenanceStore()?.markAgentEdit(filePath, payload.correlationId);
    } catch (err) {
      log.warn('[editProvenance] markAgentEdit error:', err);
    }
  });
}
