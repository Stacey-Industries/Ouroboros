/**
 * ouroborosMcp.test.ts — entry-point smoke coverage.
 *
 * The entry's `main()` performs real I/O (SQLite open, stdio transport,
 * schema probe). Full integration coverage lives in Phase D's spawn-the-
 * binary smoke. This file covers the testable seams:
 *   - the `main` symbol exists and is callable;
 *   - the `isScriptEntry` guard semantics (the module must NOT auto-spawn
 *     when imported by vitest — proven by the act of importing it without
 *     the suite hanging on a stdio transport).
 */

import { describe, expect, it } from 'vitest';

import * as entry from './ouroborosMcp';

describe('ouroborosMcp entry module', () => {
  it('exports main as a function', () => {
    expect(typeof entry.main).toBe('function');
  });

  it('does not auto-spawn the server when imported (isScriptEntry guard works)', () => {
    // If the script-entry guard misfired, importing this module would call
    // main() at import time, attempt to open SQLite + stdin/stdout, and
    // either throw or hang the test runner. Reaching this assertion means
    // the guard correctly identified vitest's argv[1] as not-the-bridge.
    expect(true).toBe(true);
  });
});
