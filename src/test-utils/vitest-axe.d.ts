/**
 * vitest-axe.d.ts — Type augmentation bridge for vitest-axe matchers.
 *
 * vitest-axe@0.1.0 augments the old `global.Vi.Assertion<T>` namespace, but
 * modern vitest (≥1.0) uses `@vitest/expect.Assertion<T>`. This file bridges
 * the gap so `.toHaveNoViolations()` is recognised on expect() return values
 * without requiring `// @ts-ignore` at every call site.
 */

/* eslint-disable @typescript-eslint/no-empty-object-type */
import type { AxeMatchers } from 'vitest-axe/dist/matchers';

declare module '@vitest/expect' {
  // Augmenting with an empty body extending AxeMatchers is the standard pattern
  // for injecting custom matchers into vitest's Assertion type.
  interface Assertion extends AxeMatchers {}
  interface AsymmetricMatchersContaining extends AxeMatchers {}
}
