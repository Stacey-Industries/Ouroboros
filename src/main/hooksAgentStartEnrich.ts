/**
 * hooksAgentStartEnrich.ts — Enriches agent_start payloads with parentSessionId
 * resolved from the subagent tracker.
 *
 * Gated on `agentMonitor.subagentDisplay.enabled` (default false).
 * When the flag is off this is a pure no-op — zero behaviour change.
 *
 * Wave 57 Phase B.
 */

import { resolveParentSessionId } from './agentChat/subagentLinkResolver';
import { traceLink } from './agentChat/subagentLinkTrace';
import { getConfigValue } from './config';
import type { HookPayload } from './hooks';

function isEnrichmentEnabled(): boolean {
  const monitor = getConfigValue('agentMonitor');
  return monitor?.subagentDisplay?.enabled === true;
}

/**
 * Return an enriched copy of `payload` when:
 *   - the `agentMonitor.subagentDisplay.enabled` flag is true
 *   - the event is `agent_start`
 *   - `parentSessionId` is not already set
 *   - the tracker has a recorded parent for this child session
 *
 * Returns the original payload reference unchanged in all other cases.
 * Never throws.
 */
export function enrichAgentStartPayload(payload: HookPayload): HookPayload {
  if (!isEnrichmentEnabled()) return payload;
  if (payload.type !== 'agent_start') return payload;
  if (payload.parentSessionId) return payload;

  const resolved = resolveParentSessionId(payload.sessionId);
  if (!resolved) return payload;

  traceLink('hook:enriched', {
    childSessionId: payload.sessionId,
    parentSessionId: resolved,
    source: 'tracker-lookup',
    timestamp: payload.timestamp,
  });
  return { ...payload, parentSessionId: resolved };
}
