/**
 * vitest.setup.ts — Global vitest setup file.
 *
 * Registers vitest-axe matchers so `expect(results).toHaveNoViolations()`
 * is available in all test files without per-file imports.
 */

import { expect } from 'vitest';

import { toHaveNoViolations } from './src/test-utils/axe';

expect.extend({ toHaveNoViolations });
