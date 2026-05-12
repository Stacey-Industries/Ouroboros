/**
 * hooksTapRunner.test.ts — Asserts runHookTaps fires every registered tap.
 */

import { describe, expect, it, vi } from 'vitest';

// Mock every tap module before importing runHookTaps so spies attach.
vi.mock('./hooksContextOutcome', () => ({ tapContextOutcomeObserver: vi.fn() }));
vi.mock('./hooksEditTap', () => ({
  tapConflictMonitor: vi.fn(),
  tapEditProvenance: vi.fn(),
}));
vi.mock('./hooksGraphUsageTap', () => ({ tapGraphUsage: vi.fn() }));
vi.mock('./hooksPreToolResearchTap', () => ({ tapPreToolResearch: vi.fn() }));
vi.mock('./hooksRankerReadTap', () => ({ tapRankerRead: vi.fn() }));
vi.mock('./hooksShadowTap', () => ({ tapShadowPath: vi.fn() }));
vi.mock('./hooksSkillExecutionTap', () => ({ tapSkillExecution: vi.fn() }));
vi.mock('./hooksSubagentTap', () => ({ tapSubagentTracker: vi.fn() }));

import type { HookPayload } from './hooks';
import { tapContextOutcomeObserver } from './hooksContextOutcome';
import { tapConflictMonitor, tapEditProvenance } from './hooksEditTap';
import { tapGraphUsage } from './hooksGraphUsageTap';
import { tapPreToolResearch } from './hooksPreToolResearchTap';
import { tapRankerRead } from './hooksRankerReadTap';
import { tapShadowPath } from './hooksShadowTap';
import { tapSkillExecution } from './hooksSkillExecutionTap';
import { tapSubagentTracker } from './hooksSubagentTap';
import { runHookTaps } from './hooksTapRunner';

describe('runHookTaps', () => {
  it('fires every registered tap with the payload', () => {
    const payload = {
      type: 'post_tool_use',
      sessionId: 's',
      timestamp: 1,
    } as unknown as HookPayload;
    const cwdMap = new Map<string, string>();

    runHookTaps(payload, cwdMap);

    expect(tapConflictMonitor).toHaveBeenCalledWith(payload, cwdMap);
    expect(tapEditProvenance).toHaveBeenCalledWith(payload);
    expect(tapContextOutcomeObserver).toHaveBeenCalledWith(payload);
    expect(tapSubagentTracker).toHaveBeenCalledWith(payload);
    expect(tapPreToolResearch).toHaveBeenCalledWith(payload);
    expect(tapGraphUsage).toHaveBeenCalledWith(payload);
    expect(tapRankerRead).toHaveBeenCalledWith(payload);
    expect(tapSkillExecution).toHaveBeenCalledWith(payload);
    expect(tapShadowPath).toHaveBeenCalledWith(payload);
  });
});
