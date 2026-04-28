/**
 * blockMinifiedOperations.test.ts — Wave 50 Phase B
 *
 * Covers the allow/deny matrix for blockMinifiedOperations per the acceptance criteria.
 */

import { describe, expect, it, vi } from 'vitest';

import { evaluatePreToolUse } from './blockMinifiedOperations';

// ─── Config mock ─────────────────────────────────────────────────────────────

vi.mock('../config', () => ({
  getConfigValue: vi.fn(() => ({
    enforcedRules: ['no-secrets', 'lockfiles', 'no-minified', 'test-scope'],
  })),
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makePayload(toolName: string, filePath: string) {
  return {
    type: 'pre_tool_use' as const,
    sessionId: 'test-session',
    toolName,
    input: { tool_name: toolName, tool_input: { file_path: filePath } },
    timestamp: Date.now(),
  };
}

function makeNonPreToolPayload(toolName: string, filePath: string) {
  return {
    type: 'post_tool_use' as const,
    sessionId: 'test-session',
    toolName,
    input: { tool_name: toolName, tool_input: { file_path: filePath } },
    timestamp: Date.now(),
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('blockMinifiedOperations — deny cases', () => {
  it('denies Read on foo.min.js', () => {
    const result = evaluatePreToolUse(makePayload('Read', '/dist/foo.min.js'));
    expect(result.kind).toBe('deny');
  });

  it('denies Edit on bundle.min.js', () => {
    const result = evaluatePreToolUse(makePayload('Edit', '/dist/bundle.min.js'));
    expect(result.kind).toBe('deny');
  });

  it('denies Read on vendor.min.mjs', () => {
    const result = evaluatePreToolUse(makePayload('Read', '/dist/vendor.min.mjs'));
    expect(result.kind).toBe('deny');
  });

  it('denies Read on styles.min.css', () => {
    const result = evaluatePreToolUse(makePayload('Read', '/dist/styles.min.css'));
    expect(result.kind).toBe('deny');
  });

  it('denies Write on output.min.js', () => {
    const result = evaluatePreToolUse(makePayload('Write', '/dist/output.min.js'));
    expect(result.kind).toBe('deny');
  });

  it('deny message names the file and is prescriptive', () => {
    const result = evaluatePreToolUse(makePayload('Read', '/dist/foo.min.js'));
    if (result.kind !== 'deny') throw new Error('expected deny');
    expect(result.message).toContain('foo.min.js');
    expect(result.message).toContain('source');
    expect(result.ruleName).toBe('no-minified');
  });

  it('is case-insensitive for the suffix', () => {
    const result = evaluatePreToolUse(makePayload('Read', '/dist/FOO.MIN.JS'));
    expect(result.kind).toBe('deny');
  });
});

describe('blockMinifiedOperations — allow cases', () => {
  it('allows Read on a normal .js file', () => {
    const result = evaluatePreToolUse(makePayload('Read', '/src/main.js'));
    expect(result.kind).toBe('pass');
  });

  it('allows Read on a .ts file', () => {
    const result = evaluatePreToolUse(makePayload('Read', '/src/main.ts'));
    expect(result.kind).toBe('pass');
  });

  it('allows Read on a file that contains "min" but is not .min.js', () => {
    const result = evaluatePreToolUse(makePayload('Read', '/src/minimal.js'));
    expect(result.kind).toBe('pass');
  });

  it('allows Bash tool regardless of path', () => {
    const result = evaluatePreToolUse(makePayload('Bash', '/dist/foo.min.js'));
    expect(result.kind).toBe('pass');
  });

  it('allows Grep tool on minified paths', () => {
    const result = evaluatePreToolUse(makePayload('Grep', '/dist/foo.min.js'));
    expect(result.kind).toBe('pass');
  });

  it('passes through non-pre_tool_use event types', () => {
    const result = evaluatePreToolUse(makeNonPreToolPayload('Read', '/dist/foo.min.js'));
    expect(result.kind).toBe('pass');
  });
});

describe('blockMinifiedOperations — disabled via enforcedRules', () => {
  it('returns pass when no-minified is not in enforcedRules', async () => {
    const configMod = await import('../config');
    vi.mocked(configMod.getConfigValue).mockReturnValueOnce({ enforcedRules: ['no-secrets'] });
    const result = evaluatePreToolUse(makePayload('Read', '/dist/foo.min.js'));
    expect(result.kind).toBe('pass');
  });
});
