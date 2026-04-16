/**
 * hooksContextOutcome.ts — Tap function that routes hook events to the Phase B
 * context outcome observer (Wave 24).
 *
 * Extracted from hooks.ts to keep that file under the 300-line ESLint limit.
 * Called from both dispatchToRenderer and dispatchSyntheticHookEvent for every
 * hook payload so that tool-call touches and turn-end signals are tracked.
 */

import type { HookPayload } from './hooks';
import log from './logger';
import {
  observeToolCallBySession,
  recordTurnEndBySession,
} from './orchestration/contextOutcomeObserver';

/**
 * Route a hook payload to the context outcome observer:
 *   - post_tool_use: observe the file path the tool accessed
 *   - agent_end / agent_stop / session_end: close the active turn and emit outcomes
 *
 * All I/O is deferred via setImmediate to avoid blocking the hook pipe response.
 */
export function tapContextOutcomeObserver(payload: HookPayload): void {
  const input = payload.input as Record<string, unknown> | undefined;
  if (payload.type === 'post_tool_use' && payload.toolName) {
    setImmediate(() => {
      try {
        observeToolCallBySession(payload.sessionId, payload.toolName!, {
          path: input?.path as string | undefined,
          filePath: input?.filePath as string | undefined,
          file_path: input?.file_path as string | undefined,
        });
      } catch (err) {
        log.warn('[contextOutcomeObserver] observeToolCall error:', err);
      }
    });
    return;
  }
  const isEnd =
    payload.type === 'agent_end' ||
    payload.type === 'agent_stop' ||
    payload.type === 'session_end';
  if (isEnd) {
    setImmediate(() => {
      try {
        recordTurnEndBySession(payload.sessionId);
      } catch (err) {
        log.warn('[contextOutcomeObserver] recordTurnEnd error:', err);
      }
    });
  }
}
