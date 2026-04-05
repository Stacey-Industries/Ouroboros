import { afterEach, describe, expect, it, vi } from 'vitest';

// Mock logger before importing module
vi.mock('./logger', () => ({
  default: { info: vi.fn(), warn: vi.fn() },
}));

// Mock v8
vi.mock('node:v8', () => ({
  default: {
    getHeapStatistics: () => ({
      used_heap_size: 50 * 1024 * 1024,
      total_heap_size: 100 * 1024 * 1024,
      heap_size_limit: 2048 * 1024 * 1024,
      external_memory: 10 * 1024 * 1024,
    }),
  },
}));

describe('jankDetector', () => {
  afterEach(async () => {
    const mod = await import('./jankDetector');
    mod.stopJankDetector();
    vi.restoreAllMocks();
  });

  it('starts and stops without error', async () => {
    const { startJankDetector, stopJankDetector } = await import('./jankDetector');
    expect(() => startJankDetector()).not.toThrow();
    expect(() => stopJankDetector()).not.toThrow();
  });

  it('is idempotent on multiple starts', async () => {
    const { startJankDetector, stopJankDetector } = await import('./jankDetector');
    startJankDetector();
    startJankDetector(); // should not throw or create duplicate intervals
    stopJankDetector();
  });
});
