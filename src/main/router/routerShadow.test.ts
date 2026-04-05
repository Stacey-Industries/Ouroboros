import { beforeEach, describe, expect, it, vi } from 'vitest';

import { shadowRouteHookEvent } from './routerShadow';

// Mock dependencies to isolate shadow routing logic
vi.mock('electron', () => ({ app: { getPath: () => '/tmp/test-shadow' } }));
vi.mock('../config', () => ({
  getConfigValue: vi.fn(),
}));

// Track what gets logged
const loggedEntries: unknown[] = [];
vi.mock('./routerLogger', () => ({
  createRouterLogger: () => ({
    log: (entry: unknown) => loggedEntries.push(entry),
    logOverride: vi.fn(),
    close: vi.fn(),
  }),
  computePromptHash: (s: string) => s.slice(0, 16).padEnd(16, '0'),
}));

// Use real orchestrator + rule engine + classifier for integration-level tests
// (they're pure sync functions with no side effects)

import { getConfigValue } from '../config';

const getConfigMock = vi.mocked(getConfigValue);

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  loggedEntries.length = 0;
  getConfigMock.mockReset();
});

function enableRouter(): void {
  getConfigMock.mockReturnValue({
    enabled: true,
    layer1Enabled: true,
    layer2Enabled: true,
    layer3Enabled: false,
    layer2ConfidenceThreshold: 0.3,
    paranoidMode: false,
    llmJudgeSampleRate: 0,
  });
}

function disableRouter(): void {
  getConfigMock.mockReturnValue({
    enabled: false,
    layer1Enabled: false,
    layer2Enabled: false,
    layer3Enabled: false,
    layer2ConfidenceThreshold: 0.6,
    paranoidMode: false,
    llmJudgeSampleRate: 0,
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('shadowRouteHookEvent', () => {
  it('ignores non-user_prompt_submit events', () => {
    enableRouter();
    shadowRouteHookEvent({ type: 'pre_tool_use', sessionId: 's1', prompt: 'hello' });
    shadowRouteHookEvent({ type: 'agent_start', sessionId: 's1' });
    shadowRouteHookEvent({ type: 'session_stop', sessionId: 's1' });
    expect(loggedEntries).toHaveLength(0);
  });

  it('ignores events with empty or missing prompt', () => {
    enableRouter();
    shadowRouteHookEvent({ type: 'user_prompt_submit', sessionId: 's1' });
    shadowRouteHookEvent({ type: 'user_prompt_submit', sessionId: 's1', prompt: '' });
    shadowRouteHookEvent({ type: 'user_prompt_submit', sessionId: 's1', prompt: '   ' });
    expect(loggedEntries).toHaveLength(0);
  });

  it('does nothing when router is disabled', () => {
    disableRouter();
    shadowRouteHookEvent({ type: 'user_prompt_submit', sessionId: 's1', prompt: 'yes' });
    expect(loggedEntries).toHaveLength(0);
  });

  it('logs an enriched entry for a valid terminal prompt', () => {
    enableRouter();
    shadowRouteHookEvent({
      type: 'user_prompt_submit',
      sessionId: 'sess-abc',
      prompt: 'yes',
      cwd: 'C:\\projects\\myapp',
    });
    expect(loggedEntries).toHaveLength(1);
    const entry = loggedEntries[0] as Record<string, unknown>;
    expect(entry.interactionType).toBe('terminal_shadow');
    expect(entry.sessionId).toBe('sess-abc');
    expect(entry.workspaceRootHash).toBeTruthy();
    expect(entry.traceId).toBeTruthy();
  });

  it('tags entries with terminal_shadow interaction type', () => {
    enableRouter();
    shadowRouteHookEvent({
      type: 'user_prompt_submit',
      sessionId: 's1',
      prompt: 'What do you think about this architecture?',
    });
    expect(loggedEntries).toHaveLength(1);
    expect((loggedEntries[0] as Record<string, unknown>).interactionType).toBe('terminal_shadow');
  });

  it('passes cwd as workspaceRoot for hashing', () => {
    enableRouter();
    shadowRouteHookEvent({
      type: 'user_prompt_submit',
      sessionId: 's1',
      prompt: 'fix the bug',
      cwd: '/home/user/project',
    });
    const entry = loggedEntries[0] as Record<string, unknown>;
    expect(entry.workspaceRootHash).toMatch(/^[0-9a-f]{16}$/);
  });

  it('sets workspaceRootHash to null when cwd is absent', () => {
    enableRouter();
    shadowRouteHookEvent({
      type: 'user_prompt_submit',
      sessionId: 's1',
      prompt: 'yes do it',
    });
    const entry = loggedEntries[0] as Record<string, unknown>;
    expect(entry.workspaceRootHash).toBeNull();
  });
});
