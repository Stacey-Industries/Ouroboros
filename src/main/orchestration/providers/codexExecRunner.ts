import { type ChildProcess, exec, spawn } from 'child_process';
export interface CodexUsage {
  input_tokens?: number;
  cached_input_tokens?: number;
  output_tokens?: number;
}
export interface CodexThreadStartedEvent {
  type: 'thread.started';
  thread_id: string;
}
export interface CodexTurnStartedEvent {
  type: 'turn.started';
}
export interface CodexTurnCompletedEvent {
  type: 'turn.completed';
  usage?: CodexUsage;
}
export interface CodexTurnFailedEvent {
  type: 'turn.failed';
  error?: {
    message?: string;
  };
}
export interface CodexErrorEvent {
  type: 'error';
  message?: string;
}
export interface CodexAgentMessageItem {
  id: string;
  type: 'agent_message';
  text?: string;
}
export interface CodexCommandExecutionItem {
  id: string;
  type: 'command_execution';
  command?: string;
  aggregated_output?: string;
  exit_code?: number | null;
  status?: string;
}
export interface CodexFileChange {
  path?: string;
  kind?: string;
}
export interface CodexFileChangeItem {
  id: string;
  type: 'file_change';
  changes?: CodexFileChange[];
  status?: string;
}
export interface CodexItemError {
  id: string;
  type: 'error';
  message?: string;
}
export interface CodexUnknownItem {
  id: string;
  type: string;
  [key: string]: unknown;
}

export type CodexItem =
  | CodexAgentMessageItem
  | CodexCommandExecutionItem
  | CodexFileChangeItem
  | CodexItemError
  | CodexUnknownItem;

export interface CodexItemStartedEvent {
  type: 'item.started';
  item: CodexItem;
}

export interface CodexItemCompletedEvent {
  type: 'item.completed';
  item: CodexItem;
}
export type CodexExecEvent =
  | CodexThreadStartedEvent
  | CodexTurnStartedEvent
  | CodexTurnCompletedEvent
  | CodexTurnFailedEvent
  | CodexErrorEvent
  | CodexItemStartedEvent
  | CodexItemCompletedEvent
  | { type: string; [key: string]: unknown };

export interface CodexExecSpawnOptions {
  prompt: string;
  cwd: string;
  cliArgs?: string[];
  env?: Record<string, string>;
  imagePaths?: string[];
  onEvent?: (event: CodexExecEvent) => void;
  resumeThreadId?: string;
}

export interface CodexExecResult {
  threadId: string | null;
  usage?: CodexUsage;
  durationMs: number;
}

export interface CodexExecProcessHandle {
  result: Promise<CodexExecResult>;
  kill: () => void;
  pid?: number;
  readonly threadId: string | null;
}

export interface CodexExecArgs {
  command: string;
  args: string[];
}
const MAX_BUFFER_BYTES = 100 * 1024 * 1024;
function normalizeEventType(type: string): string {
  switch (type) {
    case 'thread_started':
      return 'thread.started';
    case 'turn_started':
      return 'turn.started';
    case 'turn_completed':
      return 'turn.completed';
    case 'turn_failed':
      return 'turn.failed';
    case 'item_started':
      return 'item.started';
    case 'item_completed':
      return 'item.completed';
    default:
      return type;
  }
}

function escapePowerShellArg(arg: string): string {
  return `'${arg.replace(/'/g, "''")}'`;
}

export function buildCodexExecArgs(options: CodexExecSpawnOptions): CodexExecArgs {
  const imageArgs = (options.imagePaths ?? []).flatMap((imagePath) => ['--image', imagePath]);
  const cliArgs = options.cliArgs ?? [];

  const codexArgs = options.resumeThreadId
    ? // `codex exec` accepts shared exec flags before the `resume` subcommand.
      // Flags like `--sandbox` are rejected when placed after `resume`.
      ['exec', '--json', ...cliArgs, 'resume', ...imageArgs, options.resumeThreadId, '-']
    : ['exec', '--json', ...cliArgs, ...imageArgs, '-'];

  if (process.platform === 'win32') {
    const escaped = ['codex', ...codexArgs].map(escapePowerShellArg).join(' ');
    return {
      command: 'powershell.exe',
      args: ['-NoLogo', '-Command', `& ${escaped}`],
    };
  }

  return {
    command: 'codex',
    args: codexArgs,
  };
}

function buildProcessEnv(extraEnv?: Record<string, string>): Record<string, string> {
  return {
    ...process.env,
    TERM: 'xterm-256color',
    COLORTERM: 'truecolor',
    ...extraEnv,
  } as Record<string, string>;
}

function tryParseEvent(line: string): CodexExecEvent | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed === 'object' && typeof parsed.type === 'string') {
      const normalizedType = normalizeEventType(parsed.type);
      if (normalizedType !== parsed.type) {
        return {
          ...(parsed as Record<string, unknown>),
          type: normalizedType,
        } as CodexExecEvent;
      }
      return parsed as CodexExecEvent;
    }
    console.warn('[codex-exec] parsed JSON lacks "type" field:', trimmed.slice(0, 120));
    return null;
  } catch {
    console.warn('[codex-exec] malformed line:', trimmed.slice(0, 120));
    return null;
  }
}

function killCodexProcess(child: ChildProcess): void {
  try {
    if (process.platform !== 'win32') {
      child.kill('SIGTERM');
      return;
    }
    if (child.pid) {
      exec(`taskkill /T /F /PID ${child.pid}`, { timeout: 5000 }, () => {
        try { child.kill(); } catch { /* already dead */ }
      });
    } else {
    try {
      child.kill();
    } catch {
      /* already dead */
    }
  } catch {
    /* already dead */
  }
}

interface CodexSessionState {
  threadId: string | null;
  lastUsage: CodexUsage | undefined;
  failureMessage: string | null;
  sawFailureEvent: boolean;
  stdoutBuf: string;
  stderrBuf: string;
}
function applyThreadStarted(event: CodexExecEvent, state: CodexSessionState): void {
  const e = event as CodexThreadStartedEvent;
  if (typeof e.thread_id === 'string') state.threadId = e.thread_id;
}

function applyTurnCompleted(event: CodexExecEvent, state: CodexSessionState): void {
  const e = event as CodexTurnCompletedEvent;
  if (e.usage) state.lastUsage = e.usage;
}

function applyFailureEvent(event: CodexExecEvent, state: CodexSessionState): void {
  state.sawFailureEvent = true;
  state.failureMessage = (event as CodexErrorEvent).message ?? state.failureMessage;
}

function applyTurnFailed(event: CodexExecEvent, state: CodexSessionState): void {
  state.sawFailureEvent = true;
  state.failureMessage = (event as CodexTurnFailedEvent).error?.message ?? state.failureMessage;
}

function applyItemCompleted(event: CodexExecEvent, state: CodexSessionState): void {
  const item = (event as CodexItemCompletedEvent).item;
  if (item.type !== 'error') return;
  state.sawFailureEvent = true;
  state.failureMessage = (item as CodexItemError).message ?? state.failureMessage;
}
function applyCodexEvent(event: CodexExecEvent, state: CodexSessionState): void {
  if (event.type === 'thread.started') applyThreadStarted(event, state);
  else if (event.type === 'turn.completed') applyTurnCompleted(event, state);
  else if (event.type === 'error') applyFailureEvent(event, state);
  else if (event.type === 'turn.failed') applyTurnFailed(event, state);
  else if (event.type === 'item.completed') applyItemCompleted(event, state);
}

interface CodexStdoutArgs {
  state: CodexSessionState;
  child: ChildProcess;
  onEvent: CodexExecSpawnOptions['onEvent'];
  reject: (err: Error) => void;
}
function handleCodexStdout(chunk: Buffer, args: CodexStdoutArgs): void {
  const { state, child, onEvent, reject } = args;
  state.stdoutBuf += chunk.toString();
  if (state.stdoutBuf.length > MAX_BUFFER_BYTES) {
    reject(
      new Error('Codex exec stdout buffer exceeded maximum allowed size (100 MB). Process killed.'),
    );
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
    applyCodexEvent(event, state);
    onEvent?.(event);
  }
}

interface CodexCloseArgs {
  state: CodexSessionState;
  startedAt: number;
  onEvent: CodexExecSpawnOptions['onEvent'];
  resolve: (r: CodexExecResult) => void;
  reject: (err: Error) => void;
}
function applyCodexTrailingBuf(
  state: CodexSessionState,
  onEvent: CodexExecSpawnOptions['onEvent'],
): void {
  if (!state.stdoutBuf.trim()) return;
  const event = tryParseEvent(state.stdoutBuf);
  if (event) {
    applyCodexEvent(event, state);
    onEvent?.(event);
  }
  state.stdoutBuf = '';
}

function handleCodexClose(code: number | null, args: CodexCloseArgs): void {
  const { state, startedAt, onEvent, resolve, reject } = args;
  applyCodexTrailingBuf(state, onEvent);
  if (code !== 0 && code !== null) {
    const reason =
      state.failureMessage ?? state.stderrBuf.trim() ?? `Codex exited with code ${code}`;
    reject(new Error(`Codex exec exited with code ${code}: ${reason}`));
    return;
  }
  if (state.sawFailureEvent || state.failureMessage) {
    reject(new Error(state.failureMessage ?? 'Codex exec reported a failure event.'));
    return;
  }
  resolve({ threadId: state.threadId, usage: state.lastUsage, durationMs: Date.now() - startedAt });
}
export function spawnCodexExecProcess(options: CodexExecSpawnOptions): CodexExecProcessHandle {
  const { command, args } = buildCodexExecArgs(options);
  const startedAt = Date.now();
  const child: ChildProcess = spawn(command, args, {
    cwd: options.cwd,
    env: buildProcessEnv(options.env),
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  if (child.stdin) {
    child.stdin.write(options.prompt);
    child.stdin.end();
  }
  const state: CodexSessionState = {
    threadId: null,
    lastUsage: undefined,
    failureMessage: null,
    sawFailureEvent: false,
    stdoutBuf: '',
    stderrBuf: '',
  };
  const handle: CodexExecProcessHandle = {
    result: null as unknown as Promise<CodexExecResult>,
    kill: () => killCodexProcess(child),
    pid: child.pid,
    get threadId() {
      return state.threadId;
    },
  };
  handle.result = new Promise<CodexExecResult>((resolve, reject) => {
    const stdoutArgs: CodexStdoutArgs = { state, child, onEvent: options.onEvent, reject };
    child.stdout?.on('data', (chunk: Buffer) => handleCodexStdout(chunk, stdoutArgs));
    child.stderr?.on('data', (chunk: Buffer) => {
      state.stderrBuf += chunk.toString();
      if (state.stderrBuf.length > MAX_BUFFER_BYTES)
        state.stderrBuf = state.stderrBuf.slice(-MAX_BUFFER_BYTES);
    });
    const closeArgs: CodexCloseArgs = {
      state,
      startedAt,
      onEvent: options.onEvent,
      resolve,
      reject,
    };
    child.on('close', (code) => handleCodexClose(code, closeArgs));
    child.on('error', (error) => reject(error));
  });
  return handle;
}
