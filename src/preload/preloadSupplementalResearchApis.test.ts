/**
 * preloadSupplementalResearchApis.test.ts — smoke tests for the research
 * preload slice.
 *
 * Verifies that each method on researchApi calls ipcRenderer.invoke with the
 * correct channel and forwards arguments unchanged.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Mock ipcRenderer ─────────────────────────────────────────────────────────

const mockInvoke = vi.fn();

vi.mock('electron', () => ({
  ipcRenderer: {
    invoke: mockInvoke,
  },
}));

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('researchApi', () => {
  beforeEach(() => {
    mockInvoke.mockReset();
    vi.resetModules();
  });

  it('invoke calls research:invoke with the input object', async () => {
    const { researchApi } = await import('./preloadSupplementalResearchApis');
    const input = { topic: 'app router', library: 'next', version: '15.2.0' };
    researchApi.invoke(input);
    expect(mockInvoke).toHaveBeenCalledWith('research:invoke', input);
  });

  it('invoke forwards a topic-only call', async () => {
    const { researchApi } = await import('./preloadSupplementalResearchApis');
    const input = { topic: 'typescript generics' };
    researchApi.invoke(input);
    expect(mockInvoke).toHaveBeenCalledWith('research:invoke', input);
  });

  it('invoke returns the promise from ipcRenderer.invoke', async () => {
    const { researchApi } = await import('./preloadSupplementalResearchApis');
    const expected = { success: true, artifact: { topic: 'hooks' } };
    mockInvoke.mockResolvedValue(expected);
    const result = await researchApi.invoke({ topic: 'hooks' });
    expect(result).toEqual(expected);
  });
});
