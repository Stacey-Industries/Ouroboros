/**
 * claudeMdGenerator.test.ts
 *
 * Smoke tests for claudeMdGenerator.
 *
 * generateForDirectory and generateClaudeMd both require the real `claude` CLI
 * and electron-store — untestable in unit context. We test the pure helpers
 * that are exercised via the exported surface:
 *
 * - getGenerationStatus() — pure state accessor
 * - initClaudeMdGenerator() — pure initializer (no side-effects we can observe
 *   without electron-store, but we verify it doesn't throw)
 *
 * Strategy routing is covered in claudeMdGeneratorSupport.test.ts (buildPrompt)
 * and claudeMdGeneratorInlineWarnings.test.ts (collectInlineWarnings).
 * The integration path (leanMode → collectInlineWarnings → buildPrompt) is
 * covered by claudeMdGeneratorSupport.test.ts buildPrompt strategy tests.
 */

import { describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Module-level mocks — must be declared before the import under test so that
// vitest hoisting can replace the modules before claudeMdGenerator.ts loads.
// ---------------------------------------------------------------------------

vi.mock('./config', () => ({
  getConfigValue: vi.fn((key: string) => {
    if (key === 'claudeMdSettings') {
      return {
        enabled: false,
        triggerMode: 'manual',
        model: 'sonnet',
        autoCommit: false,
        generateRoot: true,
        generateSubdirs: true,
        excludeDirs: [],
        leanMode: true,
        maxLines: 150,
      };
    }
    return undefined;
  }),
  setConfigValue: vi.fn(),
}));

vi.mock('./logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('./windowManager', () => ({
  getAllActiveWindows: vi.fn(() => []),
}));

vi.mock('./web/webServer', () => ({
  broadcastToWebClients: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Import under test (after mocks are hoisted)
// ---------------------------------------------------------------------------

import { getGenerationStatus, initClaudeMdGenerator } from './claudeMdGenerator';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('getGenerationStatus', () => {
  it('returns a status object with running: false initially', () => {
    const s = getGenerationStatus();
    expect(s).toMatchObject({ running: false });
  });

  it('returns a copy — mutations do not affect internal state', () => {
    const s1 = getGenerationStatus();
    (s1 as unknown as Record<string, unknown>).running = true;
    const s2 = getGenerationStatus();
    expect(s2.running).toBe(false);
  });
});

describe('initClaudeMdGenerator', () => {
  it('does not throw when config returns a valid settings object', () => {
    expect(() => initClaudeMdGenerator()).not.toThrow();
  });
});
