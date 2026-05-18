/**
 * hooksTapRunner.ts — Runs the registered hook taps on each dispatched payload.
 *
 * Extracted from hooks.ts to keep that file under the 300-line ESLint limit.
 * Every tap is fire-and-forget; failures must not break hook dispatch.
 */

import type { HookPayload } from './hooks';
import { tapContextOutcomeObserver } from './hooksContextOutcome';
import { tapDiffReview } from './hooksDiffReview';
import { tapConflictMonitor, tapEditProvenance } from './hooksEditTap';
import { tapGraphUsage } from './hooksGraphUsageTap';
import { tapPreToolResearch } from './hooksPreToolResearchTap';
import { tapRankerRead } from './hooksRankerReadTap';
import { tapShadowPath } from './hooksShadowTap';
import { tapSkillExecution } from './hooksSkillExecutionTap';
import { tapSubagentTracker } from './hooksSubagentTap';

export function runHookTaps(payload: HookPayload, sessionCwdMap: Map<string, string>): void {
  tapConflictMonitor(payload, sessionCwdMap);
  tapEditProvenance(payload);
  tapContextOutcomeObserver(payload);
  tapSubagentTracker(payload);
  tapPreToolResearch(payload);
  tapGraphUsage(payload);
  tapRankerRead(payload);
  tapSkillExecution(payload);
  tapShadowPath(payload);
  tapDiffReview(payload, sessionCwdMap);
}
