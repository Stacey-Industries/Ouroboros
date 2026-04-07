import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import {
  generatePipeTokens,
  getHooksToken,
  getToolServerToken,
  validatePipeAuth,
} from './pipeAuth';

describe('pipeAuth', () => {
  beforeEach(() => {
    generatePipeTokens();
  });

  describe('token generation', () => {
    it('generates 64-char hex tokens', () => {
      expect(getToolServerToken()).toMatch(/^[0-9a-f]{64}$/);
      expect(getHooksToken()).toMatch(/^[0-9a-f]{64}$/);
    });

    it('generates different tokens for tool server and hooks', () => {
      expect(getToolServerToken()).not.toBe(getHooksToken());
    });

    it('returns same token on repeated calls', () => {
      const t1 = getToolServerToken();
      const t2 = getToolServerToken();
      expect(t1).toBe(t2);
    });
  });

  describe('validatePipeAuth', () => {
    it('accepts valid auth line', () => {
      const token = getToolServerToken();
      expect(validatePipeAuth(`{"auth":"${token}"}`, token)).toBe(true);
    });

    it('rejects wrong token', () => {
      expect(validatePipeAuth('{"auth":"wrong"}', getToolServerToken())).toBe(false);
    });

    it('rejects malformed JSON', () => {
      expect(validatePipeAuth('not json', getToolServerToken())).toBe(false);
    });

    it('rejects missing auth field', () => {
      expect(validatePipeAuth('{"method":"foo"}', getToolServerToken())).toBe(false);
    });

    it('rejects non-string auth field', () => {
      expect(validatePipeAuth('{"auth":123}', getToolServerToken())).toBe(false);
    });
  });
});
