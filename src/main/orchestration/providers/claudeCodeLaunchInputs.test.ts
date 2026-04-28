/**
 * claudeCodeLaunchInputs.test.ts — Wave 51 Phase B.
 *
 * Smoke coverage for the launch-input builder. The full launch pipeline is
 * exercised in higher-level adapter tests; this file just locks in the new
 * helper's contract: cancellation short-circuit, attachment failure recovery,
 * and resume-id pass-through.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./claudeCodeContextBuilder', () => ({
  buildInitialPrompt: vi.fn(() => 'PROMPT'),
}));
vi.mock('./claudeCodeHelpers', () => ({
  cliSessionExists: vi.fn(() => true),
  launchHeadless: vi.fn(),
  materializeAttachments: vi.fn(),
}));
vi.mock('./claudeCodeState', () => ({
  activeProcesses: new Map(),
}));
vi.mock('./scopedMcpConfig', () => ({
  resolveMcpConfigPathForLaunch: vi.fn(async () => '/tmp/mcp.json'),
}));
vi.mock('../../logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { buildLaunchInputs } from './claudeCodeLaunchInputs';
import { activeProcesses } from './claudeCodeState';

interface MinimalArgs {
  context: {
    taskId: string;
    request: { goal: string; goalAttachments?: unknown[] };
  };
  cwd: string;
  resolvedModel: string | undefined;
  effectiveResumeSessionId: string | undefined;
  getCancelledBeforeLaunch: () => boolean;
  invocationTempPaths: string[];
}

function makeArgs(over: Partial<MinimalArgs> = {}): MinimalArgs {
  return {
    context: { taskId: 't1', request: { goal: 'do thing' } },
    cwd: '/proj',
    resolvedModel: 'sonnet',
    effectiveResumeSessionId: undefined,
    getCancelledBeforeLaunch: () => false,
    invocationTempPaths: [],
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  activeProcesses.clear();
});

describe('buildLaunchInputs', () => {
  it('returns null and unregisters the placeholder when cancelled', async () => {
    activeProcesses.set('t1', { kind: 'placeholder' } as unknown as never);
    const inputs = await buildLaunchInputs(
      makeArgs({ getCancelledBeforeLaunch: () => true }) as never,
    );
    expect(inputs).toBeNull();
    expect(activeProcesses.has('t1')).toBe(false);
  });

  it('returns prompt, resume id, and mcp config path on the happy path', async () => {
    const inputs = await buildLaunchInputs(
      makeArgs({ effectiveResumeSessionId: 'sess-1' }) as never,
    );
    expect(inputs?.prompt).toBe('PROMPT');
    expect(inputs?.resumeId).toBe('sess-1');
    expect(inputs?.mcpConfigPath).toBe('/tmp/mcp.json');
  });

  it('survives attachment materialization errors with empty goal suffix', async () => {
    const helpers = await import('./claudeCodeHelpers');
    (helpers.materializeAttachments as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('oom'),
    );
    const inputs = await buildLaunchInputs(
      makeArgs({
        context: {
          taskId: 't1',
          request: { goal: 'g', goalAttachments: [{ kind: 'image' }] },
        },
      }) as never,
    );
    expect(inputs?.prompt).toBe('PROMPT');
  });
});
