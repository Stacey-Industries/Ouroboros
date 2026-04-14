/**
 * backgroundJobs/jobRunner.ts — Spawns a headless Claude Code session for one job.
 *
 * Uses spawnAgentViaPtyHost (PtyHost path) or spawnAgentPty (direct PTY path),
 * matching the uniform PTY convention used throughout the codebase.
 * Correlates hook session_stop via the sessionId captured from the first
 * stream-json system/init event.
 */

import type { BackgroundJob } from '@shared/types/backgroundJob';
import { BrowserWindow } from 'electron';

import { getConfigValue } from '../config';
import log from '../logger';
import type { StreamJsonEvent } from '../orchestration/providers/streamJsonTypes';
import { buildBaseEnv, buildProviderEnv, resolveSpawnOptions } from '../ptyEnv';
import type { JobStore } from './jobStore';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface JobRunnerHandle {
  start(): Promise<void>;
  cancel(): Promise<void>;
}

export interface JobRunnerOptions {
  job: BackgroundJob;
  store: JobStore;
  onComplete?: (job: BackgroundJob) => void;
}

type SpawnResult = {
  ptyId: string;
  resultPromise: Promise<{ exitCode: number | null; resultText: string | null }>;
};

interface SpawnArgs {
  sessionId: string;
  launch: { shell: string; args: string[] };
  env: Record<string, string>;
  cwd: string;
  cols: number;
  rows: number;
  prompt: string;
  onEvent: (e: StreamJsonEvent) => void;
}

// ── Session ID capture ────────────────────────────────────────────────────────

function extractSessionId(event: StreamJsonEvent): string | null {
  if ('session_id' in event && typeof event.session_id === 'string') {
    return event.session_id;
  }
  return null;
}

// ── Spawn helpers ─────────────────────────────────────────────────────────────

async function resolveClaudeArgs(): Promise<{ shell: string; args: string[] }> {
  const cliArgs = ['-p', '--verbose', '--output-format', 'stream-json', '--dangerously-skip-permissions'];
  if (process.platform === 'win32') {
    const { escapePowerShellArg } = await import('../pty');
    const escaped = ['claude', ...cliArgs].map(escapePowerShellArg).join(' ');
    return { shell: 'powershell.exe', args: ['-NoLogo', '-Command', `& ${escaped}`] };
  }
  return { shell: 'claude', args: cliArgs };
}

async function spawnViaPtyHost(args: SpawnArgs): Promise<SpawnResult> {
  const { sessionId, launch, env, cwd, cols, rows, prompt, onEvent } = args;
  const wins = BrowserWindow.getAllWindows();
  const win = wins[0];
  if (!win) throw new Error('No BrowserWindow available for PTY spawn');
  const { spawnAgentViaPtyHost } = await import('../ptyHost/ptyHostProxyAgent');
  const res = await spawnAgentViaPtyHost(
    { id: sessionId, shell: launch.shell, args: launch.args, env, cwd, cols, rows, windowId: win.id },
    win,
    prompt,
    onEvent,
  );
  if (!res.success) throw new Error(res.error ?? 'PTY spawn failed');
  const resultPromise = (res.result ?? Promise.resolve(null)).then((r) => ({
    exitCode: null as number | null,
    resultText: r?.result ?? null,
  }));
  return { ptyId: sessionId, resultPromise };
}

interface SettledTracker {
  resultPromise: Promise<{ exitCode: number | null; resultText: string | null }>;
  settle: (v: { exitCode: number | null; resultText: string | null }) => void;
  isSettled: () => boolean;
}

function makeSettledTracker(): SettledTracker {
  let settled = false;
  let resolve!: (v: { exitCode: number | null; resultText: string | null }) => void;
  const resultPromise = new Promise<{ exitCode: number | null; resultText: string | null }>((r) => { resolve = r; });
  return {
    resultPromise,
    settle: (v) => { if (!settled) { settled = true; resolve(v); } },
    isSettled: () => settled,
  };
}

async function attachDirectPtyProc(
  args: SpawnArgs,
  tracker: SettledTracker,
): Promise<void> {
  const { sessionId, launch, env, cwd, cols, rows, prompt, onEvent } = args;
  const pty = await import('node-pty');
  const { createAgentBridge } = await import('../ptyAgentBridge');
  const { registerSession, cleanupSession, sessions } = await import('../pty');

  if (sessions.has(sessionId)) throw new Error(`Session ${sessionId} already exists`);

  const bridge = createAgentBridge({
    sessionId, onEvent,
    onComplete: (res, exitCode) => tracker.settle({ exitCode, resultText: res?.result ?? null }),
  });

  const proc = pty.spawn(launch.shell, launch.args, { name: 'xterm-256color', cols, rows, cwd, env });
  const wins = BrowserWindow.getAllWindows();
  if (wins[0]) registerSession({ id: sessionId, proc, cwd, shell: launch.shell, win: wins[0] });

  let earlyOutput = '';
  proc.onData((data: string) => { if (earlyOutput.length < 2000) earlyOutput += data; bridge.feed(data); });
  proc.onExit(({ exitCode }: { exitCode: number }) => {
    if (exitCode && exitCode !== 0) {
      log.error(`[bgJob] session ${sessionId} exited ${exitCode}. Early: ${earlyOutput.slice(0, 500)}`);
    }
    bridge.handleExit(exitCode);
    tracker.settle({ exitCode, resultText: null });
    cleanupSession(sessionId);
  });

  const eofChar = process.platform === 'win32' ? '\x1a' : '\x04';
  setTimeout(() => {
    if (sessions.has(sessionId)) { proc.write(prompt); proc.write(eofChar); }
  }, 150);
}

async function spawnDirectPty(args: SpawnArgs): Promise<SpawnResult> {
  const tracker = makeSettledTracker();
  await attachDirectPtyProc(args, tracker);
  return { ptyId: args.sessionId, resultPromise: tracker.resultPromise };
}

async function spawnJob(
  sessionId: string,
  cwd: string,
  prompt: string,
  onEvent: (e: StreamJsonEvent) => void,
): Promise<SpawnResult> {
  const launch = await resolveClaudeArgs();
  const env = buildBaseEnv({ ...buildProviderEnv('agentChat') });
  const { cols, rows } = resolveSpawnOptions({});
  const wins = BrowserWindow.getAllWindows();
  const spawnArgs: SpawnArgs = { sessionId, launch, env, cwd, cols, rows, prompt, onEvent };
  if (getConfigValue('usePtyHost') && wins[0]) return spawnViaPtyHost(spawnArgs);
  return spawnDirectPty(spawnArgs);
}

// ── Result recording ──────────────────────────────────────────────────────────

interface RunResult { exitCode: number | null; resultText: string | null }

function recordJobSuccess(store: JobStore, jobId: string, result: RunResult): void {
  const completedAt = new Date().toISOString();
  if (result.exitCode !== null && result.exitCode !== 0) {
    store.updateJob(jobId, {
      status: 'error',
      exitCode: result.exitCode ?? undefined,
      errorMessage: `Process exited with code ${result.exitCode}`,
      completedAt,
    });
  } else {
    store.updateJob(jobId, {
      status: 'done',
      exitCode: result.exitCode ?? undefined,
      resultSummary: result.resultText?.slice(0, 500) ?? undefined,
      completedAt,
    });
  }
}

function recordJobError(store: JobStore, jobId: string, err: unknown): void {
  const msg = err instanceof Error ? err.message : String(err);
  log.error(`[bgJob] job ${jobId} error:`, msg);
  store.updateJob(jobId, {
    status: 'error',
    errorMessage: msg,
    completedAt: new Date().toISOString(),
  });
}

// ── Runner factory ────────────────────────────────────────────────────────────

function makeEventHandler(store: JobStore, jobId: string): (event: StreamJsonEvent) => void {
  let capturedSessionId: string | null = null;
  return function handleEvent(event: StreamJsonEvent): void {
    if (capturedSessionId) return;
    const sid = extractSessionId(event);
    if (sid) {
      capturedSessionId = sid;
      store.updateJob(jobId, { sessionId: sid });
      log.info(`[bgJob] job ${jobId} captured sessionId=${sid}`);
    }
  };
}

interface RunContext {
  job: BackgroundJob;
  store: JobStore;
  onComplete: ((j: BackgroundJob) => void) | undefined;
  getCancelled: () => boolean;
  setPtyId: (id: string) => void;
}

async function runJobToCompletion(ctx: RunContext): Promise<void> {
  const { job, store, onComplete, getCancelled, setPtyId } = ctx;
  const { cwd: resolvedCwd } = resolveSpawnOptions({ cwd: job.projectRoot });
  const handleEvent = makeEventHandler(store, job.id);
  const { ptyId: pid, resultPromise } = await spawnJob(job.id, resolvedCwd, job.prompt, handleEvent);
  setPtyId(pid);
  if (getCancelled()) { await cancelPty(pid); return; }
  const result = await resultPromise;
  if (getCancelled()) return;
  if (store.getJob(job.id)?.status === 'cancelled') return;
  recordJobSuccess(store, job.id, result);
  const finalJob = store.getJob(job.id);
  if (finalJob) onComplete?.(finalJob);
}

export function createJobRunner(opts: JobRunnerOptions): JobRunnerHandle {
  const { job, store, onComplete } = opts;
  let ptyId: string | null = null;
  let cancelled = false;

  async function start(): Promise<void> {
    store.updateJob(job.id, { status: 'running', startedAt: new Date().toISOString() });
    log.info(`[bgJob] starting job ${job.id} in ${job.projectRoot}`);
    try {
      await runJobToCompletion({ job, store, onComplete, getCancelled: () => cancelled, setPtyId: (id) => { ptyId = id; } });
    } catch (err: unknown) {
      if (cancelled) return;
      recordJobError(store, job.id, err);
      const finalJob = store.getJob(job.id);
      if (finalJob) onComplete?.(finalJob);
    }
  }

  async function cancel(): Promise<void> {
    cancelled = true;
    const current = store.getJob(job.id);
    if (current && current.status !== 'cancelled' && current.status !== 'done' && current.status !== 'error') {
      store.updateJob(job.id, { status: 'cancelled', completedAt: new Date().toISOString() });
    }
    if (ptyId) await cancelPty(ptyId);
  }

  return { start, cancel };
}

async function cancelPty(sessionId: string): Promise<void> {
  try {
    const { killPty, sessions } = await import('../pty');
    if (sessions.has(sessionId)) killPty(sessionId);
  } catch (err) {
    log.warn('[bgJob] cancelPty error:', err);
  }
}
