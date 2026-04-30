/**
 * subagentLinkTrace.test.ts — Tests for subagentLinkTrace.ts.
 *
 * Verifies:
 *   - traceLink is a no-op when diagnostics flag is false (default)
 *   - traceLink logs when diagnostics flag is true
 *   - Output schema is stable: always includes stage, timestamp, source
 *   - Optional fields (parentSessionId, childSessionId, toolCallId) appear only when provided
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Mocks ───────────────────────────────────────────────────────────────────

vi.mock('../config', () => ({
  getConfigValue: vi.fn(),
}));

vi.mock('../logger', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { getConfigValue } from '../config';
import log from '../logger';
import { traceLink } from './subagentLinkTrace';

const mockGetConfigValue = vi.mocked(getConfigValue);
const mockLogInfo = vi.mocked(log.info);

// ─── Helpers ─────────────────────────────────────────────────────────────────

function setDiagnostics(enabled: boolean): void {
  mockGetConfigValue.mockReturnValue({ subagentDisplay: { diagnostics: enabled } } as ReturnType<
    typeof getConfigValue
  >);
}

function makePayload(overrides: Partial<Parameters<typeof traceLink>[1]> = {}) {
  return {
    source: 'test',
    timestamp: 1000,
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('traceLink — gating', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does NOT log when diagnostics is false', () => {
    setDiagnostics(false);
    traceLink('test:stage', makePayload());
    expect(mockLogInfo).not.toHaveBeenCalled();
  });

  it('does NOT log when agentMonitor config is undefined', () => {
    mockGetConfigValue.mockReturnValue(undefined as ReturnType<typeof getConfigValue>);
    traceLink('test:stage', makePayload());
    expect(mockLogInfo).not.toHaveBeenCalled();
  });

  it('does NOT log when subagentDisplay is undefined', () => {
    mockGetConfigValue.mockReturnValue({} as ReturnType<typeof getConfigValue>);
    traceLink('test:stage', makePayload());
    expect(mockLogInfo).not.toHaveBeenCalled();
  });

  it('DOES log when diagnostics is true', () => {
    setDiagnostics(true);
    traceLink('test:stage', makePayload());
    expect(mockLogInfo).toHaveBeenCalledOnce();
  });
});

describe('traceLink — output schema', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setDiagnostics(true);
  });

  it('always includes the [trace:subagent-link] prefix', () => {
    traceLink('hook:incoming', makePayload());
    expect(mockLogInfo).toHaveBeenCalledWith('[trace:subagent-link]', expect.any(Object));
  });

  it('always includes stage in the entry', () => {
    traceLink('tracker:recordStart', makePayload());
    const entry = mockLogInfo.mock.calls[0][1] as Record<string, unknown>;
    expect(entry.stage).toBe('tracker:recordStart');
  });

  it('always includes timestamp in the entry', () => {
    traceLink('tracker:recordStart', makePayload({ timestamp: 9999 }));
    const entry = mockLogInfo.mock.calls[0][1] as Record<string, unknown>;
    expect(entry.timestamp).toBe(9999);
  });

  it('always includes source in the entry', () => {
    traceLink('hook:incoming', makePayload({ source: 'named-pipe' }));
    const entry = mockLogInfo.mock.calls[0][1] as Record<string, unknown>;
    expect(entry.source).toBe('named-pipe');
  });

  it('includes parentSessionId when provided', () => {
    traceLink('hook:incoming', makePayload({ parentSessionId: 'parent-123' }));
    const entry = mockLogInfo.mock.calls[0][1] as Record<string, unknown>;
    expect(entry.parentSessionId).toBe('parent-123');
  });

  it('omits parentSessionId when not provided', () => {
    traceLink('hook:incoming', makePayload());
    const entry = mockLogInfo.mock.calls[0][1] as Record<string, unknown>;
    expect(entry).not.toHaveProperty('parentSessionId');
  });

  it('includes childSessionId when provided', () => {
    traceLink('hook:incoming', makePayload({ childSessionId: 'child-456' }));
    const entry = mockLogInfo.mock.calls[0][1] as Record<string, unknown>;
    expect(entry.childSessionId).toBe('child-456');
  });

  it('omits childSessionId when not provided', () => {
    traceLink('hook:incoming', makePayload());
    const entry = mockLogInfo.mock.calls[0][1] as Record<string, unknown>;
    expect(entry).not.toHaveProperty('childSessionId');
  });

  it('includes toolCallId when provided', () => {
    traceLink('chat:taskBlockObserved', makePayload({ toolCallId: 'call-789' }));
    const entry = mockLogInfo.mock.calls[0][1] as Record<string, unknown>;
    expect(entry.toolCallId).toBe('call-789');
  });

  it('omits toolCallId when not provided', () => {
    traceLink('chat:taskBlockObserved', makePayload());
    const entry = mockLogInfo.mock.calls[0][1] as Record<string, unknown>;
    expect(entry).not.toHaveProperty('toolCallId');
  });

  it('full payload round-trips correctly', () => {
    traceLink('tracker:recordEnd', {
      parentSessionId: 'p1',
      childSessionId: 'c1',
      toolCallId: 'tc1',
      source: 'named-pipe',
      timestamp: 42,
    });
    const entry = mockLogInfo.mock.calls[0][1] as Record<string, unknown>;
    expect(entry).toMatchObject({
      stage: 'tracker:recordEnd',
      parentSessionId: 'p1',
      childSessionId: 'c1',
      toolCallId: 'tc1',
      source: 'named-pipe',
      timestamp: 42,
    });
  });

  it('preserves hook:agentStart stage string verbatim', () => {
    traceLink('hook:agentStart', { source: 'test', timestamp: 0 });
    const entry = mockLogInfo.mock.calls[0][1] as Record<string, unknown>;
    expect(entry.stage).toBe('hook:agentStart');
  });
});
