/**
 * hooksRankerReadTap.ts — Wave 53b Phase B
 *
 * Hook pipeline tap that observes Read pre_tool_use events and forwards
 * them to the ranker hit-rate telemetry module. Pure observation — never
 * blocks or modifies the tool call.
 *
 * Called from runHookTaps in hooks.ts for every hook event.
 */

import type { HookPayload } from './hooks';
import log from './logger';
import { noteReadDuringSession } from './orchestration/contextRankerTelemetry';

/**
 * Extract the file_path from a pre_tool_use Read payload.
 * The actual tool args live at payload.input.tool_input (forwarded from
 * Claude Code stdin by pre_tool_use.mjs), falling back to payload.input
 * directly for synthetic test payloads that skip the nesting.
 */
function extractReadPath(payload: HookPayload): string | undefined {
  const raw = payload.input as Record<string, unknown> | undefined;
  const toolInput = (raw?.tool_input ?? raw) as Record<string, unknown> | undefined;
  const filePath = toolInput?.file_path;
  return typeof filePath === 'string' ? filePath : undefined;
}

/**
 * Extract the workspace root from a pre_tool_use payload.
 * Falls back to cwd (the session's working directory) when no explicit
 * workspace root is embedded in the payload.
 */
function extractWorkspaceRoot(payload: HookPayload): string {
  return payload.cwd ?? '';
}

export function tapRankerRead(payload: HookPayload): void {
  if (payload.type !== 'pre_tool_use') return;
  if (payload.toolName !== 'Read') return;
  const filePath = extractReadPath(payload);
  if (!filePath) return;
  const workspaceRoot = extractWorkspaceRoot(payload);
  try {
    noteReadDuringSession(payload.sessionId, filePath, workspaceRoot);
  } catch (err) {
    log.warn('[ranker-read-tap] error:', err);
  }
}
