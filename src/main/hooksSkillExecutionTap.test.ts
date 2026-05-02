/**
 * hooksSkillExecutionTap.test.ts — Unit tests for skill execution hook tap.
 */

import { beforeEach, describe, expect, it } from 'vitest';

import type { ActiveStreamContext } from './agentChat/chatOrchestrationBridgeTypes';
import type { HookPayload } from './hooks';
import { registerActiveSends, tapSkillExecution } from './hooksSkillExecutionTap';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeCtx(overrides: Partial<ActiveStreamContext> = {}): ActiveStreamContext {
  return {
    threadId: 'thread-1',
    assistantMessageId: 'msg-1',
    taskId: 'task-1',
    sessionId: 'session-1',
    link: {},
    accumulatedText: '',
    firstChunkEmitted: false,
    bufferedChunks: [],
    chunkSequence: 0,
    toolsUsed: [],
    accumulatedBlocks: [],
    monitorStartEmitted: false,
    streamEnded: false,
    chatSubagentEmissions: new Map(),
    ...overrides,
  } as ActiveStreamContext;
}

function makeAgentStartPayload(overrides: Partial<HookPayload> = {}): HookPayload {
  return {
    type: 'agent_start',
    sessionId: 'skill-session-1',
    parentSessionId: 'session-1',
    taskLabel: '/wave-plan 73',
    model: 'claude-sonnet-4-6',
    timestamp: 1000,
    ...overrides,
  } as HookPayload;
}

function makeAgentEndPayload(overrides: Partial<HookPayload> = {}): HookPayload {
  return {
    type: 'agent_end',
    sessionId: 'skill-session-1',
    parentSessionId: 'session-1',
    timestamp: 3000,
    ...overrides,
  } as HookPayload;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('tapSkillExecution', () => {
  let activeSends: Map<string, ActiveStreamContext>;
  let ctx: ActiveStreamContext;

  beforeEach(() => {
    ctx = makeCtx();
    activeSends = new Map([['task-1', ctx]]);
    registerActiveSends(activeSends);
  });

  it('accumulates a running SkillExecutionRecord on agent_start with "/" taskLabel', () => {
    tapSkillExecution(makeAgentStartPayload());

    expect(ctx.skillExecutions).toHaveLength(1);
    const rec = ctx.skillExecutions![0];
    expect(rec.skillName).toBe('wave-plan');
    expect(rec.agentId).toBe('skill-session-1');
    expect(rec.agentType).toBe('claude-sonnet-4-6');
    expect(rec.startedAt).toBe(1000);
    expect(rec.status).toBe('running');
  });

  it('updates the record to completed on agent_end', () => {
    tapSkillExecution(makeAgentStartPayload());
    tapSkillExecution(makeAgentEndPayload());

    expect(ctx.skillExecutions).toHaveLength(1);
    const rec = ctx.skillExecutions![0];
    expect(rec.status).toBe('completed');
    expect(rec.completedAt).toBe(3000);
    expect(rec.durationMs).toBe(2000);
    expect(rec.lastMessage).toBeUndefined();
  });

  it('marks record as failed on agent_end with error', () => {
    tapSkillExecution(makeAgentStartPayload());
    tapSkillExecution(makeAgentEndPayload({ error: 'something went wrong' }));

    const rec = ctx.skillExecutions![0];
    expect(rec.status).toBe('failed');
    expect(rec.lastMessage).toBe('something went wrong');
  });

  it('is a no-op for non-skill agent_start (no "/" prefix)', () => {
    tapSkillExecution(makeAgentStartPayload({ taskLabel: 'Task (subagent)' }));
    expect(ctx.skillExecutions).toBeUndefined();
  });

  it('is a no-op when parentSessionId does not match any active context', () => {
    tapSkillExecution(makeAgentStartPayload({ parentSessionId: 'unknown-session' }));
    expect(ctx.skillExecutions).toBeUndefined();
  });

  it('is a no-op for agent_end when no matching agentId in skillExecutions', () => {
    tapSkillExecution(makeAgentEndPayload({ sessionId: 'not-a-skill' }));
    expect(ctx.skillExecutions).toBeUndefined();
  });

  it('matches context by threadId as well as sessionId', () => {
    tapSkillExecution(makeAgentStartPayload({ parentSessionId: 'thread-1' }));
    expect(ctx.skillExecutions).toHaveLength(1);
  });

  it('accumulates multiple skill records across separate invocations', () => {
    tapSkillExecution(makeAgentStartPayload({ sessionId: 'skill-a', taskLabel: '/research' }));
    tapSkillExecution(makeAgentStartPayload({ sessionId: 'skill-b', taskLabel: '/review 73', timestamp: 2000 }));

    expect(ctx.skillExecutions).toHaveLength(2);
    expect(ctx.skillExecutions![0].skillName).toBe('research');
    expect(ctx.skillExecutions![1].skillName).toBe('review');
  });

  it('ignores unrelated event types', () => {
    tapSkillExecution({ type: 'pre_tool_use', sessionId: 's', timestamp: 1 } as HookPayload);
    tapSkillExecution({ type: 'post_tool_use', sessionId: 's', timestamp: 1 } as HookPayload);
    expect(ctx.skillExecutions).toBeUndefined();
  });
});
