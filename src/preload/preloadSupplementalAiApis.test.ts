import { beforeEach, describe, expect, it, vi } from 'vitest';

const { ipcInvoke } = vi.hoisted(() => ({
  ipcInvoke: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock('electron', () => ({
  ipcRenderer: {
    on: vi.fn(),
    removeListener: vi.fn(),
    invoke: ipcInvoke,
  },
}));

import { aiApi, embeddingApi } from './preloadSupplementalAiApis';

describe('preloadSupplementalAiApis', () => {
  beforeEach(() => {
    ipcInvoke.mockClear();
  });

  describe('aiApi', () => {
    it('inlineCompletion invokes ai:inline-completion', async () => {
      const req = { prompt: 'complete this' };
      await aiApi.inlineCompletion(req as never);
      expect(ipcInvoke).toHaveBeenCalledWith('ai:inline-completion', req);
    });

    it('generateCommitMessage invokes ai:generate-commit-message', async () => {
      const req = { diff: 'diff text' };
      await aiApi.generateCommitMessage(req as never);
      expect(ipcInvoke).toHaveBeenCalledWith('ai:generate-commit-message', req);
    });

    it('inlineEdit invokes ai:inline-edit', async () => {
      const req = { instruction: 'refactor this' };
      await aiApi.inlineEdit(req as never);
      expect(ipcInvoke).toHaveBeenCalledWith('ai:inline-edit', req);
    });

    it('exposes exactly three methods', () => {
      expect(Object.keys(aiApi).sort()).toEqual([
        'generateCommitMessage',
        'inlineCompletion',
        'inlineEdit',
      ]);
    });
  });

  describe('embeddingApi', () => {
    it('search invokes embedding:search with all args', async () => {
      await embeddingApi.search('query text', '/root', 5);
      expect(ipcInvoke).toHaveBeenCalledWith('embedding:search', 'query text', '/root', 5);
    });

    it('search works without optional topK arg', async () => {
      await embeddingApi.search('query', '/root');
      expect(ipcInvoke).toHaveBeenCalledWith('embedding:search', 'query', '/root', undefined);
    });

    it('getStatus invokes embedding:status', async () => {
      await embeddingApi.getStatus('/root');
      expect(ipcInvoke).toHaveBeenCalledWith('embedding:status', '/root');
    });

    it('reindex invokes embedding:reindex', async () => {
      await embeddingApi.reindex('/root');
      expect(ipcInvoke).toHaveBeenCalledWith('embedding:reindex', '/root');
    });

    it('exposes exactly three methods', () => {
      expect(Object.keys(embeddingApi).sort()).toEqual(['getStatus', 'reindex', 'search']);
    });
  });
});
