/**
 * globalSetup.ts — Playwright global setup for E2E tests.
 *
 * Responsibilities:
 *  1. Build a `claude` stub wrapper (.cmd on Windows, shell script elsewhere)
 *     in a temp bin directory and prepend it to PATH so the Electron app
 *     never calls the real Anthropic API during tests.
 *  2. Set OUROBOROS_TOOL_TOKEN / OUROBOROS_HOOKS_TOKEN to known test values
 *     so auth assertions in specs can match deterministically.
 *  3. Append a random suffix to OUROBOROS_HOOK_PIPE so tests don't collide
 *     with the host Claude Code process running inside the IDE.
 *
 * All env mutations go to process.env — Playwright propagates these to
 * worker processes automatically for globalSetup.
 */

import { execSync } from 'child_process';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// ── Known test token values ────────────────────────────────────────────────────

export const TEST_TOOL_TOKEN = 'test-tool-token-' + crypto.randomBytes(8).toString('hex');
export const TEST_HOOKS_TOKEN = 'test-hooks-token-' + crypto.randomBytes(8).toString('hex');
export const TEST_HOOK_PIPE_SUFFIX = crypto.randomBytes(4).toString('hex');

// ── Mock binary directory (persisted for the duration of the Playwright run) ──

let mockBinDir: string | null = null;

function getMockBinDir(): string {
  if (!mockBinDir) {
    mockBinDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ouroboros-mock-bin-'));
  }
  return mockBinDir;
}

// ── Write the claude wrapper ──────────────────────────────────────────────────

function writeMockClaudeStub(binDir: string): void {
  const stubsDir = path.join(__dirname);

  if (process.platform === 'win32') {
    // On Windows write a .cmd that calls the PowerShell stub.
    // The .cmd must be named `claude.cmd` so `where claude` resolves it.
    const ps1Path = path.join(stubsDir, 'mockClaudeBin.ps1');
    const cmdContent = [
      '@echo off',
      `powershell.exe -NoProfile -ExecutionPolicy Bypass -File "${ps1Path}" %*`,
    ].join('\r\n') + '\r\n';
    fs.writeFileSync(path.join(binDir, 'claude.cmd'), cmdContent);
  } else {
    // On macOS/Linux copy the shell stub and make it executable.
    const shSrc = path.join(stubsDir, 'mockClaudeBin.sh');
    const shDst = path.join(binDir, 'claude');
    fs.copyFileSync(shSrc, shDst);
    fs.chmodSync(shDst, 0o755);
  }
}

// ── Verify mock resolves on PATH before Electron starts ───────────────────────

function verifyMockOnPath(binDir: string): void {
  const cmd = process.platform === 'win32' ? 'where claude 2>NUL' : 'which claude 2>/dev/null';
  try {
    const result = execSync(cmd, { encoding: 'utf8' }).trim();
    const expected = path.join(binDir, process.platform === 'win32' ? 'claude.cmd' : 'claude');
    if (!result.toLowerCase().startsWith(expected.toLowerCase())) {
      // Non-fatal — log for diagnosis but don't abort; PATH may still resolve correctly
      // because child processes inherit the modified PATH we set below.
      process.stderr.write(
        `[globalSetup] WARNING: PATH check found "${result}" instead of "${expected}"\n`,
      );
    }
  } catch {
    // which/where may fail if the bin dir isn't on system PATH yet — harmless here
  }
}

// ── Main export (called by Playwright before any test worker starts) ──────────

export default function globalSetup(): void {
  const binDir = getMockBinDir();
  writeMockClaudeStub(binDir);

  // Prepend mock bin dir to PATH so `claude` resolves to our stub.
  const sep = process.platform === 'win32' ? ';' : ':';
  process.env.PATH = `${binDir}${sep}${process.env.PATH ?? ''}`;

  // Known tokens — Electron app picks these up from its inherited env.
  process.env.OUROBOROS_TOOL_TOKEN = TEST_TOOL_TOKEN;
  process.env.OUROBOROS_HOOKS_TOKEN = TEST_HOOKS_TOKEN;

  // Unique pipe name suffix — prevents collision with the host IDE instance.
  process.env.OUROBOROS_HOOK_PIPE = `ouroboros-hooks-test-${TEST_HOOK_PIPE_SUFFIX}`;

  // Suppress auto-update checks during tests.
  process.env.OUROBOROS_NO_UPDATE = '1';

  verifyMockOnPath(binDir);

  process.stderr.write(
    `[globalSetup] Mock claude stub installed at ${binDir}\n` +
    `[globalSetup] OUROBOROS_HOOK_PIPE = ${process.env.OUROBOROS_HOOK_PIPE}\n`,
  );
}

// ── Teardown (optional — OS will clean temp dirs on reboot) ───────────────────

export function globalTeardown(): void {
  if (mockBinDir) {
    try {
      fs.rmSync(mockBinDir, { recursive: true, force: true });
    } catch {
      // Best-effort
    }
  }
}
