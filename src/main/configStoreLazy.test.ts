import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Stub electron and electron-store so the lazy proxy can construct under
// vitest's Node environment (no real Electron app singleton, no real schema
// validation against a persisted config file).
vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => '/tmp'),
  },
}));

const constructorCalls = { count: 0 };

vi.mock('electron-store', () => {
  return {
    default: vi.fn(function ElectronStoreStub() {
      constructorCalls.count += 1;
      return {
        store: {},
        get: vi.fn((_key: string, defaultValue?: unknown) => defaultValue),
        set: vi.fn(),
        has: vi.fn(() => false),
      };
    }),
  };
});

vi.mock('./configPreflight', () => ({
  runConfigPreflight: vi.fn(),
  resolveUserDataDir: vi.fn(() => '/tmp/test-userdata'),
}));

describe('configStoreLazy', () => {
  beforeEach(() => {
    vi.resetModules();
    constructorCalls.count = 0;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('does not construct the store at import time', async () => {
    await import('./configStoreLazy');
    expect(constructorCalls.count).toBe(0);
  });

  it('constructs the store on first proxy access', async () => {
    const { lazyStore } = await import('./configStoreLazy');
    expect(constructorCalls.count).toBe(0);
    void lazyStore.get('anyKey' as never);
    expect(constructorCalls.count).toBe(1);
  });

  it('runs the preflight before constructing the store', async () => {
    const { runConfigPreflight } = await import('./configPreflight');
    const { ensureStore } = await import('./configStoreLazy');
    expect(runConfigPreflight).not.toHaveBeenCalled();
    ensureStore();
    expect(runConfigPreflight).toHaveBeenCalledTimes(1);
  });

  it('returns the same store instance across calls', async () => {
    const { ensureStore } = await import('./configStoreLazy');
    const a = ensureStore();
    const b = ensureStore();
    expect(a).toBe(b);
    expect(constructorCalls.count).toBe(1);
  });
});
