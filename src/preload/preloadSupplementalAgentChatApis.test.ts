/**
 * preloadSupplementalAgentChatApis.test.ts
 *
 * Smoke tests verifying that agentChatApi relays calls to ipcRenderer.invoke
 * on the correct channels, including the Phase F cost rollup methods.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// vi.mock is hoisted — the factory must not reference outer variables.
vi.mock('electron', () => ({
  ipcRenderer: {
    invoke: vi.fn().mockResolvedValue({ success: true }),
    on: vi.fn(),
    removeListener: vi.fn(),
  },
}));

import { ipcRenderer } from 'electron';
import { agentChatApi } from './preloadSupplementalAgentChatApis';

const mockInvoke = ipcRenderer.invoke as ReturnType<typeof vi.fn>;
const mockOn = ipcRenderer.on as ReturnType<typeof vi.fn>;
const mockRemoveListener = ipcRenderer.removeListener as ReturnType<typeof vi.fn>;

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('agentChatApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInvoke.mockResolvedValue({ success: true });
  });

  it('createThread invokes the correct channel', async () => {
    await agentChatApi.createThread({ workspaceRoot: '/proj', title: 'T' } as Parameters<typeof agentChatApi.createThread>[0]);
    expect(mockInvoke).toHaveBeenCalledWith('agentChat:createThread', expect.anything());
  });

  it('loadThread invokes the correct channel', async () => {
    await agentChatApi.loadThread('t1');
    expect(mockInvoke).toHaveBeenCalledWith('agentChat:loadThread', 't1');
  });

  it('getThreadCostRollup invokes the correct channel', async () => {
    const payload = { threadId: 'abc' };
    await agentChatApi.getThreadCostRollup(payload);
    expect(mockInvoke).toHaveBeenCalledWith('agentChat:getThreadCostRollup', payload);
  });

  it('getGlobalCostRollup invokes the correct channel without payload', async () => {
    await agentChatApi.getGlobalCostRollup(undefined);
    expect(mockInvoke).toHaveBeenCalledWith('agentChat:getGlobalCostRollup', undefined);
  });

  it('getGlobalCostRollup invokes the correct channel with timeRange', async () => {
    const payload = { timeRange: { from: 1000, to: 2000 } };
    await agentChatApi.getGlobalCostRollup(payload);
    expect(mockInvoke).toHaveBeenCalledWith('agentChat:getGlobalCostRollup', payload);
  });

  it('onThreadUpdate registers and returns a cleanup', () => {
    const cb = vi.fn();
    const cleanup = agentChatApi.onThreadUpdate(cb);
    expect(mockOn).toHaveBeenCalledWith('agentChat:thread', expect.any(Function));
    cleanup();
    expect(mockRemoveListener).toHaveBeenCalled();
  });

  it('cancelTask invokes the correct channel', async () => {
    await agentChatApi.cancelTask('task-99');
    expect(mockInvoke).toHaveBeenCalledWith('agentChat:cancelTask', 'task-99');
  });

  it('exportThread invokes the correct channel', async () => {
    await agentChatApi.exportThread('t1', 'markdown');
    expect(mockInvoke).toHaveBeenCalledWith('agentChat:exportThread', 't1', 'markdown');
  });
});
