/**
 * claudeUsagePoller.ts — Background poller that spawns a headless Claude Code
 * REPL, runs `/usage`, captures the rate limit output, and writes it to the
 * same file the statusline capture script uses (~/.ouroboros/claude-usage.json).
 *
 * This provides usage data even when no interactive Claude session is running.
 */

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import * as pty from 'node-pty';

import log from './logger';

const POLL_INTERVAL_MS = 5 * 60_000;
const SPAWN_TIMEOUT_MS = 25_000;
const USAGE_DIR = path.join(os.homedir(), '.ouroboros');
const USAGE_FILE = path.join(USAGE_DIR, 'claude-usage.json');

// ── ANSI / parsing ─────────────────────────────────────────────────────

/* eslint-disable no-control-regex */
const ANSI_CSI = /\x1B\[[0-9;]*[A-Za-z]/g;
const ANSI_OSC = /\x1B\][^\x07]*\x07/g;
const ANSI_PRIV = /\x1B\[[?>][0-9;]*[A-Za-z]/g;
/* eslint-enable no-control-regex */

function stripAnsi(text: string): string {
  return text.replace(ANSI_PRIV, '').replace(ANSI_CSI, '').replace(ANSI_OSC, '');
}

interface ParsedUsage {
  fiveHourUsed: number | null;
  sevenDayUsed: number | null;
  fiveHourResetsAt: string | null;
  sevenDayResetsAt: string | null;
}

export function parseUsageText(raw: string): ParsedUsage {
  const clean = stripAnsi(raw);
  const result: ParsedUsage = {
    fiveHourUsed: null,
    sevenDayUsed: null,
    fiveHourResetsAt: null,
    sevenDayResetsAt: null,
  };

  // "/usage" output format (after stripping block chars + ANSI):
  //   Current session
  //   ████...  80% used
  //   Resets 11pm (America/Toronto)
  //
  //   Current week (all models)
  //   ██████...  29% used
  //   Resets Apr 4, 1pm (America/Toronto)
  // TUI cursor-positioning means stripped output may have no spaces between words.
  // Match both spaced ("Current session") and collapsed ("Currentsession") forms.
  const collapsed = clean.replace(/\s+/g, '');
  const sessionMatch =
    /Current\s*session[\s\S]{0,300}?(\d+)\s*%\s*used/i.exec(clean) ||
    /Currentsession[\s\S]{0,300}?(\d+)%used/i.exec(collapsed);
  if (sessionMatch) result.fiveHourUsed = parseInt(sessionMatch[1], 10);

  const weekMatch =
    /Current\s*week[\s\S]{0,300}?(\d+)\s*%\s*used/i.exec(clean) ||
    /Currentweek[\s\S]{0,300}?(\d+)%used/i.exec(collapsed);
  if (weekMatch) result.sevenDayUsed = parseInt(weekMatch[1], 10);

  result.fiveHourResetsAt = extractResetText(clean, collapsed, 'session');
  result.sevenDayResetsAt = extractResetText(clean, collapsed, 'week');

  return result;
}

// Timezone pattern: (America/Toronto), (Europe/London), etc.
const TZ_RE = /\([A-Z]\w+\/\w+\)/;
// After "Current session...N%used", capture text up to (Timezone)
const SESSION_RESET_RE =
  /Current\s*session[\s\S]{0,400}?\d+\s*%\s*used([\s\S]{0,100}?\([A-Z]\w+\/\w+\))/i;
const SESSION_RESET_COLLAPSED_RE =
  /Currentsession[\s\S]{0,400}?\d+%used([\s\S]{0,100}?\([A-Z]\w+\/\w+\))/i;
const WEEK_RESET_RE =
  /Current\s*week[\s\S]{0,400}?\d+\s*%\s*used([\s\S]{0,100}?\([A-Z]\w+\/\w+\))/i;
const WEEK_RESET_COLLAPSED_RE =
  /Currentweek[\s\S]{0,400}?\d+%used([\s\S]{0,100}?\([A-Z]\w+\/\w+\))/i;

function cleanResetSegment(raw: string): string | null {
  // Strip leading "Resets/Reset/Rese..." (letter prefix), keep digits + date + timezone
  const text = raw.replace(/^[a-zA-Z]+/, '').trim();
  return TZ_RE.test(text) ? text : null;
}

function extractResetText(clean: string, collapsed: string, section: string): string | null {
  const spacedRe = section === 'session' ? SESSION_RESET_RE : WEEK_RESET_RE;
  const collapsedRe = section === 'session' ? SESSION_RESET_COLLAPSED_RE : WEEK_RESET_COLLAPSED_RE;
  const match = spacedRe.exec(clean) || collapsedRe.exec(collapsed);
  return match ? cleanResetSegment(match[1]) : null;
}

// ── File writer ────────────────────────────────────────────────────────

async function writeUsageFile(parsed: ParsedUsage): Promise<void> {
  const payload: Record<string, unknown> = {
    captured_at: Date.now(),
    rate_limits: {} as Record<string, unknown>,
  };

  const limits = payload['rate_limits'] as Record<string, unknown>;
  if (parsed.fiveHourUsed !== null) {
    limits['five_hour'] = {
      used_percentage: parsed.fiveHourUsed,
      resets_at: parsed.fiveHourResetsAt,
    };
  }
  if (parsed.sevenDayUsed !== null) {
    limits['seven_day'] = {
      used_percentage: parsed.sevenDayUsed,
      resets_at: parsed.sevenDayResetsAt,
    };
  }

  // eslint-disable-next-line security/detect-non-literal-fs-filename -- path from os.homedir()
  await fs.mkdir(USAGE_DIR, { recursive: true });
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- path from os.homedir()
  await fs.writeFile(USAGE_FILE, JSON.stringify(payload, null, 2), 'utf8');
}

// ── PTY spawn ──────────────────────────────────────────────────────────

interface PtySessionState {
  output: string;
  confirmedTrust: boolean;
  sentUsage: boolean;
  sentExit: boolean;
}

function needsTrustConfirmation(clean: string): boolean {
  // TUI cursor-positioning strips to no-space text (e.g. "trustthisfolder")
  const collapsed = clean.replace(/\s+/g, '').toLowerCase();
  return collapsed.includes('trustthisfolder') || collapsed.includes('safetycheck');
}

function dismissTrustPrompt(state: PtySessionState, clean: string, term: pty.IPty): void {
  if (state.confirmedTrust || !needsTrustConfirmation(clean)) return;
  state.confirmedTrust = true;
  log.info('[claude-usage-poller] trust prompt detected, confirming');
  term.write('\r');
}

function trySendUsage(state: PtySessionState, clean: string, term: pty.IPty): void {
  if (state.sentUsage || !looksReady(clean)) return;
  state.sentUsage = true;
  log.info('[claude-usage-poller] REPL ready, sending /usage');
  term.write('/usage\r');
}

function tryDismissUsageTui(state: PtySessionState, clean: string, term: pty.IPty): void {
  if (!state.sentUsage || state.sentExit || !hasUsageData(clean)) return;
  state.sentExit = true;
  setTimeout(() => {
    term.write('\x1B');
    setTimeout(() => term.write('/exit\r'), 500);
  }, 500);
}

function handlePtyData(state: PtySessionState, data: string, term: pty.IPty): void {
  state.output += data;
  const clean = stripAnsi(state.output);
  dismissTrustPrompt(state, clean, term);
  trySendUsage(state, clean, term);
  tryDismissUsageTui(state, clean, term);
}

function spawnPty(shellArgs: { shell: string; args: string[] }): pty.IPty {
  log.info('[claude-usage-poller] spawning:', shellArgs.shell, shellArgs.args);
  return pty.spawn(shellArgs.shell, shellArgs.args, {
    name: 'xterm-256color',
    cols: 120,
    rows: 30,
    cwd: os.homedir(),
  });
}

function attachPtyHandlers(
  term: pty.IPty,
  state: PtySessionState,
  finish: (result: ParsedUsage | null, reason: string) => void,
): void {
  const timeout = setTimeout(() => {
    log.warn(
      '[claude-usage-poller] timeout — trust:',
      state.confirmedTrust,
      'usage:',
      state.sentUsage,
      'exit:',
      state.sentExit,
    );
    term.kill();
    finish(null, 'timeout');
  }, SPAWN_TIMEOUT_MS);
  term.onData((data: string) => handlePtyData(state, data, term));
  term.onExit(({ exitCode }) => {
    clearTimeout(timeout);
    const parsed = parseUsageText(state.output);
    log.info('[claude-usage-poller] exited code:', exitCode, 'parsed:', JSON.stringify(parsed));
    finish(parsed.fiveHourUsed !== null ? parsed : null, 'exit');
  });
}

function spawnUsageQuery(): Promise<ParsedUsage | null> {
  return new Promise((resolve) => {
    const state: PtySessionState = {
      output: '',
      confirmedTrust: false,
      sentUsage: false,
      sentExit: false,
    };
    let resolved = false;
    const finish = (result: ParsedUsage | null, reason: string): void => {
      if (resolved) return;
      resolved = true;
      activeTerm = null;
      log.info(`[claude-usage-poller] finish(${reason}), result:`, JSON.stringify(result));
      resolve(result);
    };
    const term = spawnPty(buildShellArgs());
    activeTerm = term;
    attachPtyHandlers(term, state, finish);
  });
}

function buildShellArgs(): { shell: string; args: string[] } {
  if (process.platform === 'win32') {
    return { shell: 'powershell.exe', args: ['-NoLogo', '-Command', '& claude'] };
  }
  return { shell: 'claude', args: [] };
}

function looksReady(clean: string): boolean {
  const hasPrompt =
    /(?:^|\n)\s*>\s*$/m.test(clean) ||
    clean.includes('You:') ||
    /claude-\d|opus|sonnet|haiku/i.test(clean);
  return hasPrompt && !needsTrustConfirmation(clean.slice(-300));
}

function hasUsageData(clean: string): boolean {
  const collapsed = clean.replace(/\s+/g, '').toLowerCase();
  return collapsed.includes('%used') && collapsed.includes('current');
}

// ── Polling loop ───────────────────────────────────────────────────────

let intervalId: ReturnType<typeof setInterval> | null = null;
let activeTerm: pty.IPty | null = null;
const DRAIN_TIMEOUT_MS = 3_000;

async function pollOnce(): Promise<void> {
  try {
    const parsed = await spawnUsageQuery();
    if (parsed) {
      await writeUsageFile(parsed);
      log.info('[claude-usage-poller] captured usage data');
    }
  } catch (err) {
    log.warn('[claude-usage-poller] poll failed:', err);
  }
}

export function startClaudeUsagePoller(): void {
  if (intervalId) return;
  log.info(`[claude-usage-poller] starting (interval: ${POLL_INTERVAL_MS / 1000}s)`);
  void pollOnce();
  intervalId = setInterval(() => void pollOnce(), POLL_INTERVAL_MS);
}

export async function stopClaudeUsagePoller(): Promise<void> {
  if (!intervalId) return;
  clearInterval(intervalId);
  intervalId = null;

  if (activeTerm) {
    log.info('[claude-usage-poller] draining in-flight PTY');
    const term = activeTerm;
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        log.warn('[claude-usage-poller] drain timeout, force-killing');
        resolve();
      }, DRAIN_TIMEOUT_MS);
      term.onExit(() => {
        clearTimeout(timeout);
        resolve();
      });
      term.kill();
    });
    activeTerm = null;
  }

  log.info('[claude-usage-poller] stopped');
}
