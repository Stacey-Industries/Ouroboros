/**
 * subagentLinkResolver.test.ts — Unit tests for resolveParentSessionId.
 *
 * Wave 57 Phase B.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the subagentTracker module so tests are fully isolated from the
// module-level singleton Map in the real implementation.
vi.mock('./subagentTracker', () => ({
  getParentSessionIdFor: vi.fn(),
}));

import { getParentSessionIdFor } from './subagentTracker';
import { resolveParentSessionId } from './subagentLinkResolver';

const mockGetParentSessionIdFor = vi.mocked(getParentSessionIdFor);

describe('resolveParentSessionId', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns parentSessionId when tracker has a record with it set', () => {
    mockGetParentSessionIdFor.mockReturnValue('parent-abc');

    const result = resolveParentSessionId('child-xyz');

    expect(result).toBe('parent-abc');
    expect(mockGetParentSessionIdFor).toHaveBeenCalledWith('child-xyz');
  });

  it('returns undefined when tracker has no record for that ID', () => {
    mockGetParentSessionIdFor.mockReturnValue(undefined);

    const result = resolveParentSessionId('child-unknown');

    expect(result).toBeUndefined();
  });

  it('returns undefined when record exists but parentSessionId is empty string', () => {
    // getParentSessionIdFor normalises empty string → undefined at the tracker level
    mockGetParentSessionIdFor.mockReturnValue(undefined);

    const result = resolveParentSessionId('child-no-parent');

    expect(result).toBeUndefined();
  });

  it('returns undefined and does not throw when childSessionId is empty string', () => {
    // resolveParentSessionId short-circuits before calling tracker for falsy input
    expect(() => resolveParentSessionId('')).not.toThrow();
    const result = resolveParentSessionId('');
    expect(result).toBeUndefined();
    // Tracker should not be called for empty input
    expect(mockGetParentSessionIdFor).not.toHaveBeenCalled();
  });

  it('returns undefined and does not throw when childSessionId is null (runtime coercion)', () => {
    // Casting to satisfy TS while testing JS runtime behaviour
    expect(() => resolveParentSessionId(null as unknown as string)).not.toThrow();
    const result = resolveParentSessionId(null as unknown as string);
    expect(result).toBeUndefined();
    expect(mockGetParentSessionIdFor).not.toHaveBeenCalled();
  });

  it('returns undefined and does not throw when childSessionId is undefined (runtime coercion)', () => {
    expect(() => resolveParentSessionId(undefined as unknown as string)).not.toThrow();
    const result = resolveParentSessionId(undefined as unknown as string);
    expect(result).toBeUndefined();
    expect(mockGetParentSessionIdFor).not.toHaveBeenCalled();
  });

  it('does not mutate tracker state — mock call count stays at 1 after one resolve', () => {
    mockGetParentSessionIdFor.mockReturnValue('parent-stable');

    resolveParentSessionId('child-stable');

    // Only one call — no side effects that would cause further tracker reads
    expect(mockGetParentSessionIdFor).toHaveBeenCalledTimes(1);
  });

  it('passes the exact childSessionId to the tracker without modification', () => {
    const childId = 'session-123-abc-def';
    mockGetParentSessionIdFor.mockReturnValue(undefined);

    resolveParentSessionId(childId);

    expect(mockGetParentSessionIdFor).toHaveBeenCalledWith(childId);
  });
});
