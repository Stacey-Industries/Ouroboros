/**
 * hooksSubagentTap.ts — Hook pipeline tap for the subagent lifecycle tracker.
 *
 * Called from both dispatchToRenderer and dispatchSyntheticHookEvent in hooks.ts.
 * Handles Task tool pre/post events to track subagent start and end.
 */

import { get, onTaskToolPreUse, recordEnd } from './agentChat/subagentTracker';
import type { HookPayload } from './hooks';
import { broadcastSubagentUpdated } from './ipc-handlers/subagent';

function getChildSessionId(payload: HookPayload): string | undefined {
  return (payload.input as Record<string, unknown> | undefined)
    ?.childSessionId as string | undefined;
}

export function tapSubagentTracker(payload: HookPayload): void {
  if (payload.toolName !== 'Task') return;
  if (payload.type === 'pre_tool_use') {
    onTaskToolPreUse(payload);
    return;
  }
  if (payload.type !== 'post_tool_use' && payload.type !== 'post_tool_use_failure') return;
  const childSessionId = getChildSessionId(payload);
  if (!childSessionId) return;
  const status = payload.type === 'post_tool_use_failure' ? 'failed' : 'completed';
  recordEnd(childSessionId, status);
  // Broadcast so the renderer SubagentPanel updates without a polling timer.
  // Previously only the cancel path (subagent.ts) called broadcastSubagentUpdated;
  // natural completion (post_tool_use) and failures now broadcast too.
  const rec = get(childSessionId);
  if (rec?.parentSessionId) {
    broadcastSubagentUpdated(rec.parentSessionId);
  }
}
