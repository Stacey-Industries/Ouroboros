/**
 * hooksAgentStartEnrich.test.ts — Unit tests for enrichAgentStartPayload.
 *
 * Wave 57 Phase B.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./agentChat/subagentLinkResolver', () => ({
  resolveParentSessionId: vi.fn(),
}));

vi.mock('./agentChat/subagentLinkTrace', () => ({
  traceLink: vi.fn(),
}));

vi.mock('./config', () => ({
  getConfigValue: vi.fn(),
}));

import { resolveParentSessionId } from './agentChat/subagentLinkResolver';
import { traceLink } from './agentChat/subagentLinkTrace';
import { getConfigValue } from './config';
import { enrichAgentStartPayload } from './hooksAgentStartEnrich';
import type { HookPayload } from './hooks';

const mockResolve = vi.mocked(resolveParentSessionId);
const mockTrace = vi.mocked(traceLink);
const mockGetConfigValue = vi.mocked(getConfigValue);

function makePayload(overrides: Partial<HookPayload> = {}): HookPayload {
  return {
    type: 'agent_start',
    sessionId: 'child-session-1',
    timestamp: 1000,
    ...overrides,
  } as HookPayload;
}

function enableFlag(): void {
  mockGetConfigValue.mockReturnValue({
    subagentDisplay: { enabled: true, diagnostics: false },
  } as ReturnType<typeof getConfigValue>);
}

function disableFlag(): void {
  mockGetConfigValue.mockReturnValue({
    subagentDisplay: { enabled: false, diagnostics: false },
  } as ReturnType<typeof getConfigValue>);
}

describe('enrichAgentStartPayload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('flag off (default)', () => {
    it('returns the original payload unchanged', () => {
      disableFlag();
      const payload = makePayload();
      const result = enrichAgentStartPayload(payload);
      expect(result).toBe(payload);
    });

    it('does not call resolver when flag is off', () => {
      disableFlag();
      enrichAgentStartPayload(makePayload());
      expect(mockResolve).not.toHaveBeenCalled();
    });

    it('does not call traceLink when flag is off', () => {
      disableFlag();
      enrichAgentStartPayload(makePayload());
      expect(mockTrace).not.toHaveBeenCalled();
    });
  });

  describe('flag on — non-agent_start event types', () => {
    it('returns original payload for session_start', () => {
      enableFlag();
      const payload = makePayload({ type: 'session_start' });
      expect(enrichAgentStartPayload(payload)).toBe(payload);
      expect(mockResolve).not.toHaveBeenCalled();
    });

    it('returns original payload for pre_tool_use', () => {
      enableFlag();
      const payload = makePayload({ type: 'pre_tool_use' });
      expect(enrichAgentStartPayload(payload)).toBe(payload);
    });
  });

  describe('flag on — agent_start with parentSessionId already set', () => {
    it('returns original payload unchanged — never replaces existing parentSessionId', () => {
      enableFlag();
      const payload = makePayload({ parentSessionId: 'already-set' });
      const result = enrichAgentStartPayload(payload);
      expect(result).toBe(payload);
      expect(result.parentSessionId).toBe('already-set');
      expect(mockResolve).not.toHaveBeenCalled();
    });
  });

  describe('flag on — agent_start, no parentSessionId, resolver returns undefined', () => {
    it('returns original payload when tracker has no record', () => {
      enableFlag();
      mockResolve.mockReturnValue(undefined);
      const payload = makePayload();
      const result = enrichAgentStartPayload(payload);
      expect(result).toBe(payload);
      expect(result.parentSessionId).toBeUndefined();
    });

    it('does not call traceLink when resolver returns undefined', () => {
      enableFlag();
      mockResolve.mockReturnValue(undefined);
      enrichAgentStartPayload(makePayload());
      expect(mockTrace).not.toHaveBeenCalled();
    });
  });

  describe('flag on — agent_start, no parentSessionId, resolver returns a parent', () => {
    it('returns a new payload object with parentSessionId set', () => {
      enableFlag();
      mockResolve.mockReturnValue('parent-abc');
      const payload = makePayload();
      const result = enrichAgentStartPayload(payload);
      expect(result).not.toBe(payload);
      expect(result.parentSessionId).toBe('parent-abc');
    });

    it('preserves all other fields on the enriched payload', () => {
      enableFlag();
      mockResolve.mockReturnValue('parent-abc');
      const payload = makePayload({ sessionId: 'child-42', timestamp: 9999 });
      const result = enrichAgentStartPayload(payload);
      expect(result.sessionId).toBe('child-42');
      expect(result.timestamp).toBe(9999);
      expect(result.type).toBe('agent_start');
    });

    it('calls traceLink with hook:enriched stage and correct fields', () => {
      enableFlag();
      mockResolve.mockReturnValue('parent-abc');
      const payload = makePayload({ sessionId: 'child-99', timestamp: 5555 });
      enrichAgentStartPayload(payload);
      expect(mockTrace).toHaveBeenCalledOnce();
      expect(mockTrace).toHaveBeenCalledWith('hook:enriched', {
        childSessionId: 'child-99',
        parentSessionId: 'parent-abc',
        source: 'tracker-lookup',
        timestamp: 5555,
      });
    });

    it('passes the child sessionId to the resolver', () => {
      enableFlag();
      mockResolve.mockReturnValue('parent-abc');
      enrichAgentStartPayload(makePayload({ sessionId: 'child-lookup-check' }));
      expect(mockResolve).toHaveBeenCalledWith('child-lookup-check');
    });
  });

  describe('flag on — config returns undefined/null agentMonitor', () => {
    it('returns original payload when agentMonitor config is undefined', () => {
      mockGetConfigValue.mockReturnValue(undefined as ReturnType<typeof getConfigValue>);
      const payload = makePayload();
      const result = enrichAgentStartPayload(payload);
      expect(result).toBe(payload);
      expect(mockResolve).not.toHaveBeenCalled();
    });
  });
});
