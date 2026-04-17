/**
 * preloadSupplementalGraphApis.test.ts — smoke tests for the graph preload bridge.
 *
 * Verifies that graphApi delegates to ipcRenderer.invoke with the correct
 * channel names. No IPC transport is exercised — electron is mocked at module level.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mock electron before importing the module under test ──────────────────────

const { mockInvoke } = vi.hoisted(() => ({ mockInvoke: vi.fn() }));

vi.mock('electron', () => ({
  ipcRenderer: {
    invoke: mockInvoke,
  },
}));

// ── Import after mock is in place ─────────────────────────────────────────────

import { graphApi } from './preloadSupplementalGraphApis';

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('graphApi preload bridge', () => {
  beforeEach(() => {
    mockInvoke.mockReset();
    mockInvoke.mockResolvedValue({ success: true });
  });

  it('searchGraph invokes graph:searchGraph with query and limit', async () => {
    await graphApi.searchGraph('MyClass', 10);
    expect(mockInvoke).toHaveBeenCalledWith('graph:searchGraph', 'MyClass', 10);
  });

  it('searchGraph passes undefined limit when omitted', async () => {
    await graphApi.searchGraph('foo');
    expect(mockInvoke).toHaveBeenCalledWith('graph:searchGraph', 'foo', undefined);
  });

  it('getArchitecture invokes graph:getArchitecture with aspects', async () => {
    await graphApi.getArchitecture(['hotspots']);
    expect(mockInvoke).toHaveBeenCalledWith('graph:getArchitecture', ['hotspots']);
  });

  it('getArchitecture passes undefined aspects when omitted', async () => {
    await graphApi.getArchitecture();
    expect(mockInvoke).toHaveBeenCalledWith('graph:getArchitecture', undefined);
  });

  it('getStatus invokes graph:getStatus', async () => {
    await graphApi.getStatus();
    expect(mockInvoke).toHaveBeenCalledWith('graph:getStatus');
  });

  it('returns the value from ipcRenderer.invoke', async () => {
    const expected = { success: true, results: [] };
    mockInvoke.mockResolvedValueOnce(expected);
    const result = await graphApi.searchGraph('test');
    expect(result).toBe(expected);
  });
});
