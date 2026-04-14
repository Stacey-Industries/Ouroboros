import { beforeEach, describe, expect, it, vi } from 'vitest';

const { ipcOn, ipcRemoveListener } = vi.hoisted(() => ({
  ipcOn: vi.fn(),
  ipcRemoveListener: vi.fn(),
}));

vi.mock('electron', () => ({
  ipcRenderer: {
    on: ipcOn,
    removeListener: ipcRemoveListener,
    invoke: vi.fn(),
  },
}));

import { wave6StubApis } from './preloadWave6Stubs';

describe('wave6StubApis — Phase 0 scaffolding', () => {
  beforeEach(() => {
    ipcOn.mockClear();
    ipcRemoveListener.mockClear();
  });

  describe('acceptance: every method returns not-yet-implemented', () => {
    it('backgroundJobs.enqueue', async () => {
      const result = await wave6StubApis.backgroundJobs.enqueue({
        projectRoot: '/tmp/x',
        prompt: 'noop',
      });
      expect(result).toEqual({ success: false, error: 'not-yet-implemented' });
    });

    it('backgroundJobs.cancel / list / clearCompleted', async () => {
      const cancel = await wave6StubApis.backgroundJobs.cancel('id');
      const list = await wave6StubApis.backgroundJobs.list();
      const clear = await wave6StubApis.backgroundJobs.clearCompleted();
      for (const r of [cancel, list, clear]) {
        expect(r.success).toBe(false);
        expect(r.error).toBe('not-yet-implemented');
      }
    });

    it('agentConflict.getReports / dismiss', async () => {
      const reports = await wave6StubApis.agentConflict.getReports();
      const dismiss = await wave6StubApis.agentConflict.dismiss('a', 'b');
      expect(reports.success).toBe(false);
      expect(dismiss.success).toBe(false);
    });

    it('checkpoint.list / create / restore / delete', async () => {
      const list = await wave6StubApis.checkpoint.list({
        threadId: 't',
        projectRoot: '/tmp/x',
      });
      const create = await wave6StubApis.checkpoint.create({
        threadId: 't',
        messageId: 'm',
        projectRoot: '/tmp/x',
      });
      const restore = await wave6StubApis.checkpoint.restore({
        checkpointId: 'c',
        projectRoot: '/tmp/x',
      });
      const del = await wave6StubApis.checkpoint.delete('c');
      for (const r of [list, create, restore, del]) {
        expect(r.success).toBe(false);
        expect(r.error).toBe('not-yet-implemented');
      }
    });

    it('spec.scaffold', async () => {
      const result = await wave6StubApis.spec.scaffold({
        projectRoot: '/tmp/x',
        featureName: 'foo',
      });
      expect(result).toEqual({ success: false, error: 'not-yet-implemented' });
    });

    it('aiStream.startInlineEdit / cancelInlineEdit', async () => {
      const start = await wave6StubApis.aiStream.startInlineEdit({
        requestId: 'r',
        filePath: '/tmp/x.ts',
        instruction: 'noop',
        range: { startLine: 1, startColumn: 1, endLine: 1, endColumn: 1 },
        selectedText: '',
        prefix: '',
        suffix: '',
      });
      const cancel = await wave6StubApis.aiStream.cancelInlineEdit({ requestId: 'r' });
      expect(start.success).toBe(false);
      expect(cancel.success).toBe(false);
    });
  });

  describe('acceptance: subscriptions register and return cleanups', () => {
    it('backgroundJobs.onUpdate wires backgroundJobs:update channel', () => {
      const cleanup = wave6StubApis.backgroundJobs.onUpdate(() => {});
      expect(ipcOn).toHaveBeenCalledWith('backgroundJobs:update', expect.any(Function));
      cleanup();
      expect(ipcRemoveListener).toHaveBeenCalledWith(
        'backgroundJobs:update',
        expect.any(Function),
      );
    });

    it('agentConflict.onChange wires agentConflict:change channel', () => {
      const cleanup = wave6StubApis.agentConflict.onChange(() => {});
      expect(ipcOn).toHaveBeenCalledWith('agentConflict:change', expect.any(Function));
      cleanup();
      expect(ipcRemoveListener).toHaveBeenCalled();
    });

    it('checkpoint.onChange wires checkpoint:change channel', () => {
      const cleanup = wave6StubApis.checkpoint.onChange(() => {});
      expect(ipcOn).toHaveBeenCalledWith('checkpoint:change', expect.any(Function));
      cleanup();
      expect(ipcRemoveListener).toHaveBeenCalled();
    });

    it('aiStream.onStream wires per-request channel', () => {
      const cleanup = wave6StubApis.aiStream.onStream('req-123', () => {});
      expect(ipcOn).toHaveBeenCalledWith(
        'ai:inlineEditStream:req-123',
        expect.any(Function),
      );
      cleanup();
      expect(ipcRemoveListener).toHaveBeenCalledWith(
        'ai:inlineEditStream:req-123',
        expect.any(Function),
      );
    });
  });

  describe('shape: all five API groups exported', () => {
    it('exposes the Wave 6 API keys exactly', () => {
      expect(Object.keys(wave6StubApis).sort()).toEqual([
        'agentConflict',
        'aiStream',
        'backgroundJobs',
        'checkpoint',
        'spec',
      ]);
    });
  });
});
