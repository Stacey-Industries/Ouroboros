import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import {
  deleteTokenFile,
  generatePipeTokens,
  getHooksToken,
  getTokenFilePath,
  getToolServerToken,
  readPersistedTokens,
  setTokenFilePath,
  validatePipeAuth,
  validatePipeAuthWithGrace,
  validateTokenWithGrace,
} from './pipeAuth';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'pipeauth-test-'));
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('pipeAuth', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTempDir();
    setTokenFilePath(tmpDir);
    generatePipeTokens();
  });

  afterEach(() => {
    // Clean up temp dir
    try { fs.rmSync(tmpDir, { recursive: true }); } catch { /* ignore */ }
  });

  // ─── Token generation ───────────────────────────────────────────────────

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

  // ─── Disk persistence ──────────────────────────────────────────────────

  describe('disk persistence', () => {
    it('writes token file with correct shape after generation', () => {
      const persisted = readPersistedTokens();
      expect(persisted).not.toBeNull();
      expect(persisted!.toolToken).toBe(getToolServerToken());
      expect(persisted!.hooksToken).toBe(getHooksToken());
      expect(typeof persisted!.generatedAt).toBe('number');
      expect(persisted!.generatedAt).toBeGreaterThan(0);
    });

    it('round-trip: write then readPersistedTokens returns matching values', () => {
      const tool = getToolServerToken();
      const hooks = getHooksToken();
      const persisted = readPersistedTokens();
      expect(persisted!.toolToken).toBe(tool);
      expect(persisted!.hooksToken).toBe(hooks);
    });

    it('file mode is 0o600 on POSIX (or file exists on Windows)', () => {
      const filePath = getTokenFilePath();
      expect(filePath).not.toBeNull();
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- test-only: path is from getTokenFilePath(), a trusted temp dir
      expect(fs.existsSync(filePath!)).toBe(true);

      if (process.platform !== 'win32') {
        // eslint-disable-next-line security/detect-non-literal-fs-filename -- test-only: trusted temp path
        const stat = fs.statSync(filePath!);
        // 0o600 = owner read+write, no group/other
        expect(stat.mode & 0o777).toBe(0o600);
      }
    });

    it('deleteTokenFile removes the file', () => {
      const filePath = getTokenFilePath();
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- test-only: trusted temp path
      expect(fs.existsSync(filePath!)).toBe(true);
      deleteTokenFile();
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- test-only: trusted temp path
      expect(fs.existsSync(filePath!)).toBe(false);
    });

    it('readPersistedTokens returns null when file is missing', () => {
      deleteTokenFile();
      expect(readPersistedTokens()).toBeNull();
    });

    it('readPersistedTokens returns null when path not set', () => {
      setTokenFilePath('/nonexistent-path-that-should-not-exist');
      expect(readPersistedTokens()).toBeNull();
      // Restore
      setTokenFilePath(tmpDir);
    });
  });

  // ─── validatePipeAuth ──────────────────────────────────────────────────

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

  // ─── validateTokenWithGrace ────────────────────────────────────────────

  describe('validateTokenWithGrace', () => {
    it('accepts current tool token', () => {
      expect(validateTokenWithGrace('tool', getToolServerToken())).toBe(true);
    });

    it('accepts current hooks token', () => {
      expect(validateTokenWithGrace('hooks', getHooksToken())).toBe(true);
    });

    it('rejects unknown token', () => {
      expect(validateTokenWithGrace('tool', 'deadbeef')).toBe(false);
      expect(validateTokenWithGrace('hooks', 'deadbeef')).toBe(false);
    });

    it('accepts previous token within grace window', () => {
      const oldTool = getToolServerToken();
      const oldHooks = getHooksToken();
      // Rotate tokens
      generatePipeTokens();
      // Previous tokens should still be accepted (well within 60 s)
      expect(validateTokenWithGrace('tool', oldTool)).toBe(true);
      expect(validateTokenWithGrace('hooks', oldHooks)).toBe(true);
    });

    it('rejects previous token after grace window expires', () => {
      vi.useFakeTimers();
      const oldTool = getToolServerToken();
      const oldHooks = getHooksToken();
      // Rotate tokens
      generatePipeTokens();
      // Advance clock past 60 s grace window
      vi.advanceTimersByTime(61_000);
      expect(validateTokenWithGrace('tool', oldTool)).toBe(false);
      expect(validateTokenWithGrace('hooks', oldHooks)).toBe(false);
      vi.useRealTimers();
    });

    it('still accepts current token after previous token expires', () => {
      vi.useFakeTimers();
      generatePipeTokens();
      vi.advanceTimersByTime(61_000);
      expect(validateTokenWithGrace('tool', getToolServerToken())).toBe(true);
      expect(validateTokenWithGrace('hooks', getHooksToken())).toBe(true);
      vi.useRealTimers();
    });
  });

  // ─── validatePipeAuthWithGrace ────────────────────────────────────────

  describe('validatePipeAuthWithGrace', () => {
    it('accepts valid auth JSON for current token', () => {
      const token = getToolServerToken();
      expect(validatePipeAuthWithGrace(`{"auth":"${token}"}`, 'tool')).toBe(true);
    });

    it('rejects wrong token', () => {
      expect(validatePipeAuthWithGrace('{"auth":"wrong"}', 'tool')).toBe(false);
    });

    it('rejects malformed JSON', () => {
      expect(validatePipeAuthWithGrace('not json', 'hooks')).toBe(false);
    });

    it('accepts previous token within grace window', () => {
      const oldHooks = getHooksToken();
      generatePipeTokens();
      expect(validatePipeAuthWithGrace(`{"auth":"${oldHooks}"}`, 'hooks')).toBe(true);
    });
  });
});
