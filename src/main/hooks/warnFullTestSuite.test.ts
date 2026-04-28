/**
 * warnFullTestSuite.test.ts — Wave 50 Phase B
 *
 * Covers the warn/pass matrix for warnFullTestSuite per the acceptance criteria.
 */

import { describe, expect, it, vi } from 'vitest';

import { evaluatePreToolUse } from './warnFullTestSuite';

// ─── Config mock ─────────────────────────────────────────────────────────────

vi.mock('../config', () => ({
  getConfigValue: vi.fn(() => ({
    enforcedRules: ['no-secrets', 'lockfiles', 'no-minified', 'test-scope'],
  })),
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makePayload(command: string) {
  return {
    type: 'pre_tool_use' as const,
    sessionId: 'test-session',
    toolName: 'Bash',
    input: { tool_name: 'Bash', tool_input: { command } },
    timestamp: Date.now(),
  };
}

function makeNonBashPayload(toolName: string) {
  return {
    type: 'pre_tool_use' as const,
    sessionId: 'test-session',
    toolName,
    input: { tool_name: toolName, tool_input: { command: 'npm test' } },
    timestamp: Date.now(),
  };
}

// ─── Warn cases (no trailing path arg) ───────────────────────────────────────

describe('warnFullTestSuite — warn cases', () => {
  it('warns on bare npm test', () => {
    const result = evaluatePreToolUse(makePayload('npm test'));
    expect(result.kind).toBe('warn');
  });

  it('warns on npm run test', () => {
    const result = evaluatePreToolUse(makePayload('npm run test'));
    expect(result.kind).toBe('warn');
  });

  it('warns on npx vitest run with no path', () => {
    const result = evaluatePreToolUse(makePayload('npx vitest run'));
    expect(result.kind).toBe('warn');
  });

  it('warns on npx jest with no path', () => {
    const result = evaluatePreToolUse(makePayload('npx jest'));
    expect(result.kind).toBe('warn');
  });

  it('warns on pnpm test', () => {
    const result = evaluatePreToolUse(makePayload('pnpm test'));
    expect(result.kind).toBe('warn');
  });

  it('warns on pnpm run test', () => {
    const result = evaluatePreToolUse(makePayload('pnpm run test'));
    expect(result.kind).toBe('warn');
  });

  it('warns on yarn test', () => {
    const result = evaluatePreToolUse(makePayload('yarn test'));
    expect(result.kind).toBe('warn');
  });

  it('warns on npm test with only flags (no path)', () => {
    const result = evaluatePreToolUse(makePayload('npm test --watch'));
    expect(result.kind).toBe('warn');
  });

  it('warns on npx vitest run with only flags', () => {
    const result = evaluatePreToolUse(makePayload('npx vitest run --reporter=verbose'));
    expect(result.kind).toBe('warn');
  });

  it('warn result carries the right ruleName', () => {
    const result = evaluatePreToolUse(makePayload('npm test'));
    if (result.kind !== 'warn') throw new Error('expected warn');
    expect(result.ruleName).toBe('test-scope');
    expect(result.message).toContain('npm test');
  });
});

// ─── Pass cases (has trailing path arg) ──────────────────────────────────────

describe('warnFullTestSuite — pass cases (scoped)', () => {
  it('passes when npm test has a path arg', () => {
    const result = evaluatePreToolUse(makePayload('npm test src/main/foo.test.ts'));
    expect(result.kind).toBe('pass');
  });

  it('passes when npx vitest run has a path arg', () => {
    const result = evaluatePreToolUse(makePayload('npx vitest run src/main/hooks/'));
    expect(result.kind).toBe('pass');
  });

  it('passes when npx jest has a path arg', () => {
    const result = evaluatePreToolUse(makePayload('npx jest src/main/foo.test.ts'));
    expect(result.kind).toBe('pass');
  });

  it('passes when path arg precedes flags', () => {
    const result = evaluatePreToolUse(makePayload('npm test src/main/foo.test.ts --watch'));
    expect(result.kind).toBe('pass');
  });

  it('passes when path arg follows flags', () => {
    const result = evaluatePreToolUse(makePayload('npm test --watch src/main/foo.test.ts'));
    expect(result.kind).toBe('pass');
  });

  it('passes on an unrelated Bash command', () => {
    const result = evaluatePreToolUse(makePayload('git status'));
    expect(result.kind).toBe('pass');
  });

  it('passes on non-Bash tool even with matching command text', () => {
    const result = evaluatePreToolUse(makeNonBashPayload('Write'));
    expect(result.kind).toBe('pass');
  });

  it('passes on non-pre_tool_use event type', () => {
    const payload = {
      type: 'post_tool_use' as const,
      sessionId: 'test-session',
      toolName: 'Bash',
      input: { tool_name: 'Bash', tool_input: { command: 'npm test' } },
      timestamp: Date.now(),
    };
    const result = evaluatePreToolUse(payload);
    expect(result.kind).toBe('pass');
  });
});

// ─── Disabled via enforcedRules ───────────────────────────────────────────────

describe('warnFullTestSuite — disabled via enforcedRules', () => {
  it('returns pass when test-scope is not in enforcedRules', async () => {
    const configMod = await import('../config');
    vi.mocked(configMod.getConfigValue).mockReturnValueOnce({ enforcedRules: ['no-secrets'] });
    const result = evaluatePreToolUse(makePayload('npm test'));
    expect(result.kind).toBe('pass');
  });
});
