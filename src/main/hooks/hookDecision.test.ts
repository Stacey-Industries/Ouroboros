/**
 * hookDecision.test.ts — Smoke tests for the HookDecision type and PASS constant.
 */

import { describe, expect, it } from 'vitest';

import { type HookDecision, PASS } from './hookDecision';

describe('hookDecision', () => {
  it('PASS has kind === pass', () => {
    expect(PASS.kind).toBe('pass');
  });

  it('deny decision carries ruleName and message', () => {
    const decision: HookDecision = {
      kind: 'deny',
      ruleName: 'no-secrets',
      message: 'refusing to edit .env',
    };
    expect(decision.kind).toBe('deny');
    if (decision.kind === 'deny') {
      expect(decision.ruleName).toBe('no-secrets');
      expect(decision.message).toContain('.env');
    }
  });

  it('warn decision carries ruleName and message', () => {
    const decision: HookDecision = {
      kind: 'warn',
      ruleName: 'test-scope',
      message: 'full test suite detected',
    };
    expect(decision.kind).toBe('warn');
    if (decision.kind === 'warn') {
      expect(decision.ruleName).toBe('test-scope');
      expect(decision.message).toBeTruthy();
    }
  });
});
