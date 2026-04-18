/**
 * vitest-jest-dom.d.ts — Type augmentation for @testing-library/jest-dom matchers.
 *
 * The Dispatch test files (Wave 34 Phase E) use jest-dom matchers that aren't
 * installed as a runtime dep but whose type signatures are needed to satisfy
 * tsconfig.web.json. This file augments vitest's Assertion interface so tsc can
 * resolve those member accesses without the actual runtime library.
 *
 * Return type matches vitest's internal JestAssertion chain style (Assertion<T>).
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
declare module 'vitest' {
  interface Assertion<T = any> {
    toBeInTheDocument(): T;
    toHaveTextContent(text: string | RegExp, options?: { normalizeWhitespace?: boolean }): T;
    toHaveAttribute(attr: string, value?: string): T;
  }
}
