import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ── Electron stub (hoisted so mock factory can reference it) ───────────────────
const mockIpcHandle = vi.fn();
vi.mock('electron', () => ({
  app: { getPath: () => '/mock/userData', getAppPath: () => '/mock/app' },
  BrowserWindow: { getAllWindows: vi.fn(() => []), getFocusedWindow: vi.fn(() => null) },
  ipcMain: { handle: mockIpcHandle },
}));

// ── Logger stub ────────────────────────────────────────────────────────────────
vi.mock('../logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// ── config stub ────────────────────────────────────────────────────────────────
const mockGetConfigValue = vi.fn();
vi.mock('../config', () => ({ getConfigValue: mockGetConfigValue }));

// ── embeddings stub ────────────────────────────────────────────────────────────
const mockGetStatus = vi.fn().mockReturnValue({ indexed: 0, total: 0 });
const mockClose = vi.fn();
const mockStore = { getStatus: mockGetStatus, close: mockClose };
const mockSearchSimilar = vi.fn().mockResolvedValue([]);
const mockCreateEmbeddingStore = vi.fn().mockReturnValue(mockStore);
const mockCreateProvider = vi.fn().mockReturnValue({});
const mockIndexProject = vi.fn().mockResolvedValue({ indexed: 0, total: 0 });

vi.mock('../embeddings', () => ({
  createEmbeddingStore: mockCreateEmbeddingStore,
  createProvider: mockCreateProvider,
  searchSimilar: mockSearchSimilar,
  indexProject: mockIndexProject,
}));

// ── Capture handlers at module load time ───────────────────────────────────────
type AnyHandler = (...args: unknown[]) => unknown;
const capturedHandlers = new Map<string, AnyHandler>();
mockIpcHandle.mockImplementation((channel: string, fn: AnyHandler) => {
  capturedHandlers.set(channel, fn);
});

describe('embeddingHandlers', () => {
  it('module exports registerEmbeddingHandlers and closeEmbeddingStore', async () => {
    const mod = await import('./embeddingHandlers');
    expect(typeof mod.registerEmbeddingHandlers).toBe('function');
    expect(typeof mod.closeEmbeddingStore).toBe('function');
  });
});

describe('embeddingHandlers — disabled flag', () => {
  type SearchHandler = (e: unknown, query: string, root: string, topK?: number) => Promise<unknown>;
  type StatusHandler = (e: unknown, root: string) => unknown;
  type ReindexHandler = (e: unknown, root: string) => Promise<unknown>;

  let handleSearch: SearchHandler;
  let handleStatus: StatusHandler;
  let handleReindex: ReindexHandler;

  beforeEach(async () => {
    mockGetConfigValue.mockReset();
    // Ensure the module is loaded and handlers captured
    const mod = await import('./embeddingHandlers');
    // Trigger registration if not yet done
    mod.registerEmbeddingHandlers(() => null as never);

    handleSearch = capturedHandlers.get('embedding:search') as SearchHandler;
    handleStatus = capturedHandlers.get('embedding:status') as StatusHandler;
    handleReindex = capturedHandlers.get('embedding:reindex') as ReindexHandler;
  });

  afterEach(() => {
    vi.clearAllMocks();
    // Restore capture mock after clearAllMocks
    mockIpcHandle.mockImplementation((channel: string, fn: AnyHandler) => {
      capturedHandlers.set(channel, fn);
    });
  });

  describe('when embeddingsEnabled is false', () => {
    beforeEach(() => {
      mockGetConfigValue.mockReturnValue(false);
    });

    it('embedding:search returns disabled error', async () => {
      const result = await handleSearch(null, 'query', '/root') as { success: boolean; error?: string };
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/embedding:search-disabled/);
    });

    it('embedding:status returns disabled error', () => {
      const result = handleStatus(null, '/root') as { success: boolean; error?: string };
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/embedding:status-disabled/);
    });

    it('embedding:reindex returns disabled error', async () => {
      const result = await handleReindex(null, '/root') as { success: boolean; error?: string };
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/embedding:reindex-disabled/);
    });
  });

  describe('when embeddingsEnabled is true', () => {
    beforeEach(() => {
      mockGetConfigValue.mockImplementation((key: string) => {
        if (key === 'embeddingsEnabled') return true;
        return undefined;
      });
      mockSearchSimilar.mockResolvedValue([{ file: 'a.ts', score: 0.9 }]);
      mockGetStatus.mockReturnValue({ indexed: 5, total: 10 });
      mockIndexProject.mockResolvedValue({ indexed: 10, total: 10 });
    });

    it('embedding:search returns results', async () => {
      const result = await handleSearch(null, 'query', '/root', 3);
      expect(result).toMatchObject({ success: true, results: expect.any(Array) });
    });

    it('embedding:status returns status', () => {
      const result = handleStatus(null, '/root');
      expect(result).toMatchObject({ success: true, status: { indexed: 5, total: 10 } });
    });

    it('embedding:reindex returns indexed count', async () => {
      const result = await handleReindex(null, '/root');
      expect(result).toMatchObject({ success: true, indexed: 10, total: 10 });
    });
  });
});
