/**
 * ptyArgEscape.test.ts — Unit tests for escapePowerShellArg.
 */

import { describe, expect, it } from 'vitest';

import { escapePowerShellArg } from './ptyArgEscape';

describe('escapePowerShellArg', () => {
  it('wraps a plain string in single quotes', () => {
    expect(escapePowerShellArg('hello')).toBe("'hello'");
  });

  it('doubles embedded single quotes', () => {
    expect(escapePowerShellArg("it's")).toBe("'it''s'");
  });

  it('handles multiple embedded single quotes', () => {
    expect(escapePowerShellArg("a'b'c")).toBe("'a''b''c'");
  });

  it('handles empty string', () => {
    expect(escapePowerShellArg('')).toBe("''");
  });

  it('leaves other special characters untouched', () => {
    const raw = 'foo $bar `baz "qux"';
    expect(escapePowerShellArg(raw)).toBe(`'foo $bar \`baz "qux"'`);
  });
});
