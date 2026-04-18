/**
 * sessionSpawnAdapter.ts — Wave 34 Phase C.
 *
 * Minimal wrapper over the backgroundJobs spawn path so sessionDispatchRunner
 * can call a clean interface without touching ptyAgent or backgroundJobs directly.
 *
 * Assumptions / defaults applied here:
 *   - --dangerously-skip-permissions (same as backgroundJobs/jobRunner.ts; dispatch
 *     tasks come from the user's own device via paired-write channel — no interactive
 *     approval flow is available while headless).
 *   - No model override: inherits config default (agentChat provider).
 *   - Uses the first available BrowserWindow as the PTY owner.  If none exists,
 *     spawn fails gracefully with an error string.
 */

import { randomUUID } from 'node:crypto';

import { BrowserWindow } from 'electron';

import { getConfigValue } from '../config';
import log from '../logger';
import { buildBaseEnv, buildProviderEnv, resolveSpawnOptions } from '../ptyEnv';

// ── Public types ──────────────────────────────────────────────────────────────

export interface SpawnAdapterRequest {
  prompt: string;
  projectPath: string;
  /** Overrides cwd when a worktree was created. */
  worktreePath?: string;
}

export interface SessionHandle {
  /** Internal PTY session ID (used for kill). */
  ptyId: string;
  /** Resolves when the session exits (success or error). */
  completion: Promise<void>;
}

// ── Args builder ──────────────────────────────────────────────────────────────

async function buildClaudeArgs(): Promise<{ shell: string; args: string[] }> {
  const cliArgs = ['-p', '--verbose', '--output-format', 'stream-json', '--dangerously-skip-permissions'];
  if (process.platform === 'win32') {
    const { escapePowerShellArg } = await import('../pty');
    const escaped = ['claude', ...cliArgs].map(escapePowerShellArg).join(' ');
    return { shell: 'powershell.exe', args: ['-NoLogo', '-Command', `& ${escaped}`] };
  }
  return { shell: 'claude', args: cliArgs };
}

// ── PtyHost spawn path ────────────────────────────────────────────────────────

async function spawnViaPtyHost(opts: {
  id: string; launch: { shell: string; args: string[] };
  env: Record<string, string>; cwd: string; cols: number; rows: number;
  prompt: string; win: BrowserWindow;
}): Promise<SessionHandle> {
  const { spawnAgentViaPtyHost } = await import('../ptyHost/ptyHostProxyAgent');
  const res = await spawnAgentViaPtyHost(
    { id: opts.id, shell: opts.launch.shell, args: opts.launch.args, env: opts.env,
      cwd: opts.cwd, cols: opts.cols, rows: opts.rows, windowId: opts.win.id },
    opts.win, opts.prompt, undefined,
  );
  if (!res.success) throw new Error(res.error ?? 'PtyHost spawn failed');
  const completion = (res.result ?? Promise.resolve(null)).then(() => undefined);
  return { ptyId: opts.id, completion };
}

// ── Direct PTY spawn path ─────────────────────────────────────────────────────

async function spawnDirect(opts: {
  id: string; launch: { shell: string; args: string[] };
  env: Record<string, string>; cwd: string; cols: number; rows: number;
  prompt: string; win: BrowserWindow;
}): Promise<SessionHandle> {
  const nodePty = await import('node-pty');
  const { createAgentBridge } = await import('../ptyAgentBridge');
  const { registerSession, cleanupSession, sessions } = await import('../pty');

  if (sessions.has(opts.id)) throw new Error(`Session ${opts.id} already exists`);

  let resolve!: () => void;
  const completion = new Promise<void>((r) => { resolve = r; });

  const bridge = createAgentBridge({
    sessionId: opts.id, onEvent: undefined as never,
    onComplete: () => resolve(),
  });

  const proc = nodePty.spawn(opts.launch.shell, opts.launch.args, {
    name: 'xterm-256color', cols: opts.cols, rows: opts.rows, cwd: opts.cwd, env: opts.env,
  });
  registerSession({ id: opts.id, proc, cwd: opts.cwd, shell: opts.launch.shell, win: opts.win });

  let earlyOutput = '';
  proc.onData((data: string) => {
    if (earlyOutput.length < 2000) earlyOutput += data;
    bridge.feed(data);
  });
  proc.onExit(({ exitCode }: { exitCode: number }) => {
    if (exitCode && exitCode !== 0) {
      log.error(`[dispatchSpawn] session ${opts.id} exited ${exitCode}. Early: ${earlyOutput.slice(0, 500)}`);
    }
    bridge.handleExit(exitCode);
    cleanupSession(opts.id);
    resolve();
  });

  const eofChar = process.platform === 'win32' ? '\x1a' : '\x04';
  setTimeout(() => {
    if (sessions.has(opts.id)) { proc.write(opts.prompt); proc.write(eofChar); }
  }, 150);

  return { ptyId: opts.id, completion };
}

// ── Public factory ────────────────────────────────────────────────────────────

/**
 * Spawns a headless Claude Code session for a dispatch job.
 * Picks ptyHost or direct path based on `config.usePtyHost`, matching
 * the rest of the codebase's uniform convention.
 */
export async function spawnAgentSession(req: SpawnAdapterRequest): Promise<SessionHandle> {
  const wins = BrowserWindow.getAllWindows();
  const win = wins[0];
  if (!win) throw new Error('No BrowserWindow available — cannot spawn dispatch session');

  const id = randomUUID();
  const cwd = req.worktreePath ?? req.projectPath;
  const launch = await buildClaudeArgs();
  const env = buildBaseEnv({ ...buildProviderEnv('agentChat') });
  const { cols, rows } = resolveSpawnOptions({ cwd });

  const spawnOpts = { id, launch, env, cwd, cols, rows, prompt: req.prompt, win };

  if (getConfigValue('usePtyHost') === true) return spawnViaPtyHost(spawnOpts);
  return spawnDirect(spawnOpts);
}

/**
 * Terminates a running dispatch session by PTY ID. Best-effort — logs and
 * swallows errors so the caller can always proceed to mark the job failed.
 */
export async function killSession(ptyId: string): Promise<void> {
  try {
    const { killPty, sessions } = await import('../pty');
    if (sessions.has(ptyId)) await killPty(ptyId);
  } catch (err) {
    log.warn('[dispatchSpawn] killSession error:', err);
  }
}
