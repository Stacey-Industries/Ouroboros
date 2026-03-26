// ---------------------------------------------------------------------------
// Stream-JSON process runner for Claude Code
// Spawns `claude -p --output-format stream-json` and parses NDJSON output.
// ---------------------------------------------------------------------------

import { type ChildProcess, exec, spawn } from 'child_process';

import log from '../../logger';
import type {
  StreamJsonEvent,
  StreamJsonProcessHandle,
  StreamJsonResultEvent,
  StreamJsonSpawnOptions,
} from './streamJsonTypes';

// ---- Arg builder (exported for testability) --------------------------------

export interface StreamJsonArgs {
  command: string;
  args: string[];
}

export function buildStreamJsonArgs(options: StreamJsonSpawnOptions): StreamJsonArgs {
  const cliArgs: string[] = ['-p', '--verbose', '--output-format', 'stream-json'];

  if (options.model) {
    cliArgs.push('--model', options.model);
  }
  if (options.permissionMode) {
    cliArgs.push('--permission-mode', options.permissionMode);
  }
  if (options.dangerouslySkipPermissions) {
    cliArgs.push('--dangerously-skip-permissions');
  }
  if (options.continueSession) {
    cliArgs.push('--continue');
  }
  if (options.resumeSessionId) {
    cliArgs.push('--resume', options.resumeSessionId);
  }

  // Only cap turns for 'low' effort (quick lookup queries).
  // All other effort levels run without --max-turns, matching Claude Code CLI
  // behavior: the model decides when it's done.
  if (options.effort === 'low') {
    cliArgs.push('--max-turns', '5');
  }

  // Prompt is piped via stdin (not passed as a positional arg) to avoid
  // shell-escaping issues and command-line length limits on Windows.

  if (process.platform === 'win32') {
    // Security: use single-quote escaping for each argument to prevent
    // command injection through PowerShell metacharacters. Single-quoted
    // strings in PowerShell are literal — no variable expansion or
    // subexpression evaluation.
    const escaped = ['claude', ...cliArgs].map((a) => `'${a.replace(/'/g, "''")}'`).join(' ');
    return {
      command: 'powershell.exe',
      args: ['-NoLogo', '-Command', `& ${escaped}`],
    };
  }

  return { command: 'claude', args: cliArgs };
}

// ---- Env builder (self-contained, no pty import) ---------------------------

function buildProcessEnv(extraEnv?: Record<string, string>): Record<string, string> {
  return {
    ...process.env,
    TERM: 'xterm-256color',
    COLORTERM: 'truecolor',
    ...extraEnv,
  } as Record<string, string>;
}

// ---- Buffer size limit (security: prevent OOM from runaway output) ----------
//
// A broken or malicious Claude Code process could send unlimited data and
// exhaust the IDE's memory.  Cap the accumulated buffer at 100 MB.
const MAX_BUFFER_BYTES = 100 * 1024 * 1024;

// ---- NDJSON line parser ----------------------------------------------------

function tryParseEvent(line: string): StreamJsonEvent | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed === 'object' && typeof parsed.type === 'string') {
      return parsed as StreamJsonEvent;
    }
    console.warn('[claudeStreamJson] parsed JSON lacks "type" field:', trimmed.slice(0, 120));
    return null;
  } catch {
    console.warn('[claudeStreamJson] malformed line:', trimmed.slice(0, 120));
    return null;
  }
}

// ---- Process kill helper ---------------------------------------------------

function killStreamJsonProcess(child: ChildProcess): void {
  try {
    if (process.platform !== 'win32') {
      child.kill('SIGTERM');
      return;
    }
    if (child.pid) {
      // eslint-disable-next-line security/detect-child-process -- PID is a numeric process ID from child_process.spawn, not user input
      exec(`taskkill /T /F /PID ${child.pid}`, { timeout: 5000 }, () => {
        try {
          child.kill();
        } catch {
          /* already dead */
        }
      });
    } else {
      try {
        child.kill();
      } catch {
        /* already dead */
      }
    }
  } catch {
    /* already dead */
  }
}

// ---- Session state container -----------------------------------------------

interface StreamSessionState {
  sessionId: string | null;
  resultEvent: StreamJsonResultEvent | null;
  stdoutBuf: string;
  stderrBuf: string;
}

// ---- Stdout data handler ---------------------------------------------------

interface StdoutHandlerArgs {
  state: StreamSessionState;
  child: ChildProcess;
  onEvent: StreamJsonSpawnOptions['onEvent'];
  reject: (err: Error) => void;
}

function handleStdoutData(chunk: Buffer, args: StdoutHandlerArgs): void {
  const { state, child, onEvent, reject } = args;
  state.stdoutBuf += chunk.toString();
  if (state.stdoutBuf.length > MAX_BUFFER_BYTES) {
    log.error(`stdout buffer exceeded ${MAX_BUFFER_BYTES} bytes — killing process`);
    reject(new Error('Stream buffer exceeded maximum allowed size (100 MB). Process killed.'));
    try {
      child.kill();
    } catch {
      /* already dead */
    }
    return;
  }
  let newlineIdx: number;
  while ((newlineIdx = state.stdoutBuf.indexOf('\n')) !== -1) {
    const line = state.stdoutBuf.slice(0, newlineIdx);
    state.stdoutBuf = state.stdoutBuf.slice(newlineIdx + 1);
    const event = tryParseEvent(line);
    if (!event) continue;
    if (!state.sessionId && event.session_id) state.sessionId = event.session_id;
    if (event.type === 'result') state.resultEvent = event as StreamJsonResultEvent;
    onEvent?.(event);
  }
}

// ---- Close handler ---------------------------------------------------------

interface CloseHandlerArgs {
  state: StreamSessionState;
  onEvent: StreamJsonSpawnOptions['onEvent'];
  resolve: (result: StreamJsonResultEvent) => void;
  reject: (err: Error) => void;
}

function applyTrailingBuf(
  state: StreamSessionState,
  onEvent: StreamJsonSpawnOptions['onEvent'],
): void {
  if (!state.stdoutBuf.trim()) return;
  const event = tryParseEvent(state.stdoutBuf);
  if (event) {
    if (!state.sessionId && event.session_id) state.sessionId = event.session_id;
    if (event.type === 'result') state.resultEvent = event as StreamJsonResultEvent;
    onEvent?.(event);
  }
  state.stdoutBuf = '';
}

function handleProcessClose(code: number | null, args: CloseHandlerArgs): void {
  const { state, onEvent, resolve, reject } = args;
  applyTrailingBuf(state, onEvent);
  if (state.resultEvent) {
    resolve(state.resultEvent);
    return;
  }
  if (code === 0 || code === null) {
    resolve({
      type: 'result',
      subtype: 'success',
      is_error: false,
      result: '',
      session_id: state.sessionId ?? undefined,
    });
  } else {
    reject(new Error(`Claude Code exited with code ${code}: ${state.stderrBuf.trim()}`));
  }
}

// ---- Main export -----------------------------------------------------------

export function spawnStreamJsonProcess(options: StreamJsonSpawnOptions): StreamJsonProcessHandle {
  const { command, args } = buildStreamJsonArgs(options);
  const child: ChildProcess = spawn(command, args, {
    cwd: options.cwd,
    env: buildProcessEnv(options.env),
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  if (child.stdin) {
    child.stdin.write(options.prompt);
    child.stdin.end();
  }

  const state: StreamSessionState = {
    sessionId: null,
    resultEvent: null,
    stdoutBuf: '',
    stderrBuf: '',
  };

  const handle: StreamJsonProcessHandle = {
    result: null as unknown as Promise<StreamJsonResultEvent>,
    kill: () => killStreamJsonProcess(child),
    pid: child.pid,
    get sessionId() {
      return state.sessionId;
    },
  };

  handle.result = new Promise<StreamJsonResultEvent>((resolve, reject) => {
    const stdoutArgs: StdoutHandlerArgs = { state, child, onEvent: options.onEvent, reject };
    child.stdout?.on('data', (chunk: Buffer) => handleStdoutData(chunk, stdoutArgs));
    child.stderr?.on('data', (chunk: Buffer) => {
      state.stderrBuf += chunk.toString();
      // Security: cap stderr buffer to prevent OOM from verbose error output.
      if (state.stderrBuf.length > MAX_BUFFER_BYTES)
        state.stderrBuf = state.stderrBuf.slice(-MAX_BUFFER_BYTES);
    });
    const closeArgs: CloseHandlerArgs = { state, onEvent: options.onEvent, resolve, reject };
    child.on('close', (code) => handleProcessClose(code, closeArgs));
    child.on('error', (err) => reject(err));
  });

  return handle;
}
