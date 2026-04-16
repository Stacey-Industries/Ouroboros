/**
 * contextRerankerSpawn.ts — Short-lived Claude CLI spawn for Haiku reranking.
 *
 * POSSIBLE_NOT_SUPPORTED: true
 *   The `claude --print --model haiku` pattern relies on the Claude CLI supporting
 *   non-interactive (one-shot) mode via `--print`. If the installed CLI version does
 *   not support `--print`, calls will hang or error immediately. The helper detects
 *   non-zero exit and returns success:false — the reranker falls back silently.
 *
 * Auth note: uses the CLI's own stored credentials (OAuth / max subscription).
 * No API key required. The CLI process inherits the current env, which includes
 * the Anthropic auth token set by `claude login`.
 *
 * Security: child_process is used intentionally to invoke the Claude CLI as an
 * external process. Prompt is passed via stdin, never as a shell argument —
 * injection via prompt content is not possible. Static import (not dynamic require)
 * so security/detect-child-process does not apply here.
 */

import type { ChildProcess } from 'child_process';
import { spawn } from 'child_process';

export interface RerankerSpawnResult {
  success: boolean;
  output?: string;
  error?: string;
  latencyMs: number;
}

export interface SpawnHaikuDeps {
  /** Spawn a process; defaults to child_process.spawn */
  spawnFn?: typeof spawn;
  /** Override for platform detection (used in tests) */
  platform?: string;
}

const DEFAULT_TIMEOUT_MS = 500;

function buildClaudeArgs(platform: string): { cmd: string; args: string[] } {
  const cliArgs = ['--model', 'haiku', '--print'];
  if (platform === 'win32') {
    // On Windows invoke via powershell to match the pattern in ptySpawn.ts / ptyAgent.ts.
    const escaped = ['claude', ...cliArgs].join(' ');
    return { cmd: 'powershell.exe', args: ['-NonInteractive', '-NoLogo', '-Command', `& ${escaped}`] };
  }
  return { cmd: 'claude', args: cliArgs };
}

interface WireOpts {
  child: ChildProcess;
  start: number;
  timer: ReturnType<typeof setTimeout>;
  timedOut: () => boolean;
  finish: (r: RerankerSpawnResult) => void;
}

function wireChildEvents(opts: WireOpts): void {
  const { child, start, timer, timedOut, finish } = opts;
  let stdout = '';
  let stderr = '';
  child.stdout?.on('data', (chunk: Buffer) => { stdout += chunk.toString('utf8'); });
  child.stderr?.on('data', (chunk: Buffer) => { stderr += chunk.toString('utf8'); });
  child.on('error', (err) => {
    clearTimeout(timer);
    finish({ success: false, error: err.message, latencyMs: Date.now() - start });
  });
  child.on('close', (code) => {
    clearTimeout(timer);
    if (timedOut()) return;
    const latencyMs = Date.now() - start;
    if (code !== 0) { finish({ success: false, error: `exit ${code}: ${stderr.slice(0, 200)}`, latencyMs }); return; }
    const trimmed = stdout.trim();
    if (!trimmed) { finish({ success: false, error: 'empty output', latencyMs }); return; }
    finish({ success: true, output: trimmed, latencyMs });
  });
}

interface WriteStdinOpts {
  child: ChildProcess;
  prompt: string;
  start: number;
  timer: ReturnType<typeof setTimeout>;
  finish: (r: RerankerSpawnResult) => void;
}

function writeStdin(opts: WriteStdinOpts): void {
  const { child, prompt, start, timer, finish } = opts;
  try {
    child.stdin?.write(prompt, 'utf8', () => { child.stdin?.end(); });
  } catch (err) {
    clearTimeout(timer);
    finish({ success: false, error: err instanceof Error ? err.message : String(err), latencyMs: Date.now() - start });
  }
}

/**
 * Spawn a short-lived `claude --model haiku --print` process with the given
 * prompt piped to stdin. Resolves within `timeoutMs` (default 500 ms).
 *
 * Always resolves — never throws. Returns `success: false` on timeout, non-zero
 * exit, or malformed (empty) output.
 */
export function spawnHaikuForRerank(
  prompt: string,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  deps: SpawnHaikuDeps = {},
): Promise<RerankerSpawnResult> {
  return new Promise((resolve) => {
    const start = Date.now();
    const platform = deps.platform ?? process.platform;
    const spawnFn = deps.spawnFn ?? spawn;
    const { cmd, args } = buildClaudeArgs(platform);
    let _timedOut = false;
    let settled = false;
    const finish = (result: RerankerSpawnResult): void => { if (settled) return; settled = true; resolve(result); };
    const child = spawnFn(cmd, args, { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    const timer = setTimeout(() => {
      _timedOut = true;
      try { child.kill(); } catch { /* ignore */ }
      finish({ success: false, error: 'timeout', latencyMs: Date.now() - start });
    }, timeoutMs);
    wireChildEvents({ child, start, timer, timedOut: () => _timedOut, finish });
    writeStdin({ child, prompt, start, timer, finish });
  });
}
