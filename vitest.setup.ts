/**
 * vitest.setup.ts — Global vitest setup file.
 *
 * Registers vitest-axe matchers so `expect(results).toHaveNoViolations()`
 * is available in all test files without per-file imports.
 *
 * Also globally mocks `electron-log/renderer` — it hits Electron APIs that
 * don't exist under vitest's jsdom/node environments and crashes the worker
 * silently (observed: imports succeed but the fork exits during test
 * collection, causing vitest to hang waiting for output). Per-file mocks
 * are error-prone because the import is transitive through many hooks.
 */

import { expect, vi } from 'vitest';

import { toHaveNoViolations } from './src/test-utils/axe';

expect.extend({ toHaveNoViolations });

vi.mock('electron-log/renderer', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), verbose: vi.fn() },
}));
