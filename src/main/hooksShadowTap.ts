/**
 * hooksShadowTap.ts — Forwards hook payloads to the Wave 86 canonical state path.
 *
 * Extracted from hooks.ts to stay under the 300-line ESLint limit.
 * Called once per dispatched hook event from runHookTaps() in hooks.ts.
 *
 * The HookPayload type in hooks.ts uses camelCase (sessionId); the eventNormalizer
 * expects snake_case (session_id). This adapter maps between the two.
 */

import { getShadowTap } from './agentChat/shadowTap';
import type { HookPayload } from './hooks';

export function tapShadowPath(payload: HookPayload): void {
  const tap = getShadowTap();
  if (!tap) return;
  tap.onHookEvent({
    type: payload.type,
    session_id: payload.sessionId,
    decision: payload.data?.['decision'] as string | undefined,
    toolName: payload.toolName,
    toolCallId: payload.toolCallId,
    input: payload.input,
    fileNames: payload.data?.['file_names'] as string[] | undefined,
    totalCount: payload.data?.['total_count'] as number | undefined,
  });
}
