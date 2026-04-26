/**
 * hookInstallerStatusLine.test.ts — Unit tests for status-line registration helpers.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Hoisted mocks ─────────────────────────────────────────────────────────────

const { mockReadClaudeSettings, mockWriteFileSync, mockLog } = vi.hoisted(() => ({
  mockReadClaudeSettings: vi.fn(),
  mockWriteFileSync: vi.fn(),
  mockLog: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('./hookInstaller', () => ({
  readClaudeSettings: mockReadClaudeSettings,
}));

vi.mock('fs', () => ({
  default: {
    writeFileSync: mockWriteFileSync,
    existsSync: vi.fn().mockReturnValue(false),
    readFileSync: vi.fn().mockReturnValue('{}'),
  },
}));

vi.mock('./logger', () => ({
  default: mockLog,
}));

// ── Import after mocks ───────────────────────────────────────────────────────

import path from 'path';

import {
  buildStatusLineCommand,
  isOuroborosStatusLine,
  registerStatusLineInSettings,
} from './hookInstallerStatusLine';

// ── Tests ────────────────────────────────────────────────────────────────────

// Use os.homedir()-relative path so path.join produces platform-correct separators
const HOOKS_DIR = path.join(process.env['HOME'] ?? 'C:\\Users\\test', '.claude', 'hooks');

describe('buildStatusLineCommand', () => {
  it('returns a cross-platform node invocation referencing the .mjs script', () => {
    const cmd = buildStatusLineCommand(HOOKS_DIR);
    expect(cmd).toMatch(/^node "/);
    expect(cmd).toContain('statusline_capture.mjs');
    expect(cmd).not.toContain('powershell');
    expect(cmd).not.toContain('.ps1');
    expect(cmd).not.toContain('.sh');
  });
});

describe('isOuroborosStatusLine', () => {
  it('returns false when statusLine is absent', () => {
    expect(isOuroborosStatusLine({}, HOOKS_DIR)).toBe(false);
  });

  it('returns false when statusLine command does not reference our script', () => {
    const settings = { statusLine: { command: '/usr/local/bin/some-other-tool' } };
    expect(isOuroborosStatusLine(settings, HOOKS_DIR)).toBe(false);
  });

  it('returns true when statusLine command references our statusline_capture script', () => {
    const cmd = path.join(HOOKS_DIR, 'statusline_capture.sh');
    const settings = { statusLine: { command: cmd } };
    expect(isOuroborosStatusLine(settings, HOOKS_DIR)).toBe(true);
  });
});

describe('registerStatusLineInSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('writes settings when no existing statusLine', () => {
    mockReadClaudeSettings.mockReturnValue({});
    registerStatusLineInSettings(HOOKS_DIR);
    expect(mockWriteFileSync).toHaveBeenCalled();
    expect(mockLog.info).toHaveBeenCalledWith(expect.stringContaining('registered statusLine'));
  });

  it('skips when a non-ouroboros statusLine is already configured', () => {
    mockReadClaudeSettings.mockReturnValue({
      statusLine: { command: '/usr/bin/some-other-tool' },
    });
    registerStatusLineInSettings(HOOKS_DIR);
    expect(mockWriteFileSync).not.toHaveBeenCalled();
    expect(mockLog.info).toHaveBeenCalledWith(expect.stringContaining('existing statusLine'));
  });

  it('overwrites when the existing statusLine is ours', () => {
    const cmd = path.join(HOOKS_DIR, 'statusline_capture.sh');
    mockReadClaudeSettings.mockReturnValue({
      statusLine: { command: cmd },
    });
    registerStatusLineInSettings(HOOKS_DIR);
    expect(mockWriteFileSync).toHaveBeenCalled();
  });
});
