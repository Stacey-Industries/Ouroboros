/**
 * blockLockfileEdits.test.ts — Wave 50 Phase B
 *
 * Covers the allow/deny matrix for blockLockfileEdits per the acceptance criteria.
 */

import { describe, expect, it, vi } from 'vitest';

import { evaluatePreToolUse } from './blockLockfileEdits';

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

describe('blockLockfileEdits — deny cases', () => {
  it('denies Write on package-lock.json', () => {
    const result = evaluatePreToolUse(makePayload('Write', '/project/package-lock.json'));
    expect(result.kind).toBe('deny');
  });

  it('denies Edit on pnpm-lock.yaml', () => {
    const result = evaluatePreToolUse(makePayload('Edit', '/project/pnpm-lock.yaml'));
    expect(result.kind).toBe('deny');
  });

  it('denies Write on yarn.lock', () => {
    const result = evaluatePreToolUse(makePayload('Write', '/project/yarn.lock'));
    expect(result.kind).toBe('deny');
  });

  it('denies Edit on bun.lockb', () => {
    const result = evaluatePreToolUse(makePayload('Edit', '/project/bun.lockb'));
    expect(result.kind).toBe('deny');
  });

  it('denies on nested path to package-lock.json', () => {
    const result = evaluatePreToolUse(
      makePayload('Write', '/project/packages/core/package-lock.json'),
    );
    expect(result.kind).toBe('deny');
  });

  it('deny message names the file and is prescriptive', () => {
    const result = evaluatePreToolUse(makePayload('Write', '/project/package-lock.json'));
    if (result.kind !== 'deny') throw new Error('expected deny');
    expect(result.message).toContain('package-lock.json');
    expect(result.message).toContain('npm install');
    expect(result.ruleName).toBe('lockfiles');
  });
});

describe('blockLockfileEdits — allow cases', () => {
  it('allows Write on package.json', () => {
    const result = evaluatePreToolUse(makePayload('Write', '/project/package.json'));
    expect(result.kind).toBe('pass');
  });

  it('allows Write on an unrelated file', () => {
    const result = evaluatePreToolUse(makePayload('Write', '/project/src/main.ts'));
    expect(result.kind).toBe('pass');
  });

  it('allows Read on package-lock.json (read-only, not write)', () => {
    const result = evaluatePreToolUse(makePayload('Read', '/project/package-lock.json'));
    expect(result.kind).toBe('pass');
  });

  it('allows Bash tool regardless of path', () => {
    const result = evaluatePreToolUse(makePayload('Bash', '/project/package-lock.json'));
    expect(result.kind).toBe('pass');
  });

  it('passes through non-pre_tool_use event types', () => {
    const result = evaluatePreToolUse(makeNonPreToolPayload('Write', '/project/package-lock.json'));
    expect(result.kind).toBe('pass');
  });
});

describe('blockLockfileEdits — disabled via enforcedRules', () => {
  it('returns pass when lockfiles is not in enforcedRules', async () => {
    const configMod = await import('../config');
    vi.mocked(configMod.getConfigValue).mockReturnValueOnce({ enforcedRules: ['no-secrets'] });
    const result = evaluatePreToolUse(makePayload('Write', '/project/package-lock.json'));
    expect(result.kind).toBe('pass');
  });
});
