/**
 * blockSecretWrites.test.ts — Wave 50 Phase B
 *
 * Covers the allow/deny matrix for blockSecretWrites per the acceptance criteria.
 */

import { describe, expect, it, vi } from 'vitest';

import { evaluatePreToolUse } from './blockSecretWrites';

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

describe('blockSecretWrites — deny cases', () => {
  it('denies Write on .env', () => {
    const result = evaluatePreToolUse(makePayload('Write', '/project/.env'));
    expect(result.kind).toBe('deny');
  });

  it('denies Edit on .env.local', () => {
    const result = evaluatePreToolUse(makePayload('Edit', '/project/.env.local'));
    expect(result.kind).toBe('deny');
  });

  it('denies Write on .env.production', () => {
    const result = evaluatePreToolUse(makePayload('Write', '/project/.env.production'));
    expect(result.kind).toBe('deny');
  });

  it('denies Edit on .env.test', () => {
    const result = evaluatePreToolUse(makePayload('Edit', '/project/.env.test'));
    expect(result.kind).toBe('deny');
  });

  it('deny message names the file and is prescriptive', () => {
    const result = evaluatePreToolUse(makePayload('Write', '/project/.env.local'));
    if (result.kind !== 'deny') throw new Error('expected deny');
    expect(result.message).toContain('.env.local');
    expect(result.ruleName).toBe('no-secrets');
  });
});

describe('blockSecretWrites — allow cases', () => {
  it('allows Write on .env.sample', () => {
    const result = evaluatePreToolUse(makePayload('Write', '/project/.env.sample'));
    expect(result.kind).toBe('pass');
  });

  it('allows Write on .env.example', () => {
    const result = evaluatePreToolUse(makePayload('Write', '/project/.env.example'));
    expect(result.kind).toBe('pass');
  });

  it('allows Write on .env.template', () => {
    const result = evaluatePreToolUse(makePayload('Write', '/project/.env.template'));
    expect(result.kind).toBe('pass');
  });

  it('allows Write on a non-env file', () => {
    const result = evaluatePreToolUse(makePayload('Write', '/project/src/main.ts'));
    expect(result.kind).toBe('pass');
  });

  it('allows Read on .env (read-only, not write)', () => {
    const result = evaluatePreToolUse(makePayload('Read', '/project/.env'));
    expect(result.kind).toBe('pass');
  });

  it('allows Bash on a command (not a write tool)', () => {
    const result = evaluatePreToolUse(makePayload('Bash', '/project/.env'));
    expect(result.kind).toBe('pass');
  });

  it('passes through non-pre_tool_use event types', () => {
    const result = evaluatePreToolUse(makeNonPreToolPayload('Write', '/project/.env'));
    expect(result.kind).toBe('pass');
  });
});

describe('blockSecretWrites — disabled via enforcedRules', () => {
  it('returns pass when no-secrets is not in enforcedRules', async () => {
    const configMod = await import('../config');
    vi.mocked(configMod.getConfigValue).mockReturnValueOnce({ enforcedRules: ['lockfiles'] });
    const result = evaluatePreToolUse(makePayload('Write', '/project/.env'));
    expect(result.kind).toBe('pass');
  });
});
