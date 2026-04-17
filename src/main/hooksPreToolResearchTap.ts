/**
 * hooksPreToolResearchTap.ts — Hook pipeline tap for Wave 30 Phase D pre-tool research.
 *
 * Called from dispatchToRenderer and dispatchSyntheticHookEvent in hooks.ts for
 * pre_tool_use events on Edit/Write/MultiEdit tools. Fire-and-forget — never blocks
 * the hook approval flow.
 */

import type { HookPayload } from './hooks';
import log from './logger';
import { maybeFireResearchForPreTool } from './research/preToolResearchOrchestrator';

const PRE_TOOL_RESEARCH_TOOLS = new Set(['Edit', 'Write', 'MultiEdit']);

function extractFilePath(payload: HookPayload): string | undefined {
  const input = payload.input as Record<string, unknown> | undefined;
  return input?.file_path as string | undefined ?? input?.path as string | undefined;
}

export function tapPreToolResearch(payload: HookPayload): void {
  if (payload.type !== 'pre_tool_use') return;
  if (!payload.toolName || !PRE_TOOL_RESEARCH_TOOLS.has(payload.toolName)) return;
  const filePath = extractFilePath(payload);
  if (!filePath) return;
  setImmediate(() => {
    try {
      maybeFireResearchForPreTool({
        sessionId: payload.sessionId,
        toolUseId: payload.toolCallId ?? '',
        filePath,
        correlationId: payload.correlationId,
      });
    } catch (err) {
      log.warn('[preToolResearch] tap error:', err);
    }
  });
}
