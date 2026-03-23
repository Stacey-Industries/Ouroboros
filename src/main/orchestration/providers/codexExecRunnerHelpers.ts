import { type ChildProcess, exec } from 'child_process';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Session state
// ---------------------------------------------------------------------------

export interface CodexSessionState {
  threadId: string | null;
  lastUsage: CodexUsage | undefined;
  failureMessage: string | null;
  sawFailureEvent: boolean;
  stdoutBuf: string;
  stderrBuf: string;
}

// ---------------------------------------------------------------------------
// Arg building
// ---------------------------------------------------------------------------

function escapePowerShellArg(arg: string): string {
  return `'${arg.replace(/'/g, "''")}'`;
}

export function buildCodexExecArgs(options: CodexExecSpawnOptions): CodexExecArgs {
  const imageArgs = (options.imagePaths ?? []).flatMap((imagePath) => ['--image', imagePath]);
  const cliArgs = options.cliArgs ?? [];

  const codexArgs = options.resumeThreadId
    ? ['exec', '--json', ...cliArgs, 'resume', ...imageArgs, options.resumeThreadId, '-']
    : ['exec', '--json', ...cliArgs, ...imageArgs, '-'];

  if (process.platform === 'win32') {
    const escaped = ['codex', ...codexArgs].map(escapePowerShellArg).join(' ');
    return {
      command: 'powershell.exe',
      args: ['-NoLogo', '-Command', `& ${escaped}`],
    };
  }

  return { command: 'codex', args: codexArgs };
}

export function buildProcessEnv(extraEnv?: Record<string, string>): Record<string, string> {
  return {
    ...process.env,
    TERM: 'xterm-256color',
    COLORTERM: 'truecolor',
    ...extraEnv,
  } as Record<string, string>;
}

// ---------------------------------------------------------------------------
// Event parsing
// ---------------------------------------------------------------------------

function normalizeEventType(type: string): string {
  switch (type) {
    case 'thread_started': return 'thread.started';
    case 'turn_started': return 'turn.started';
    case 'turn_completed': return 'turn.completed';
    case 'turn_failed': return 'turn.failed';
    case 'item_started': return 'item.started';
    case 'item_completed': return 'item.completed';
    default: return type;
  }
}

export function tryParseEvent(line: string): CodexExecEvent | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed === 'object' && typeof parsed.type === 'string') {
      const normalizedType = normalizeEventType(parsed.type);
      if (normalizedType !== parsed.type) {
        return { ...(parsed as Record<string, unknown>), type: normalizedType } as CodexExecEvent;
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

// ---------------------------------------------------------------------------
// Process lifecycle
// ---------------------------------------------------------------------------

export function killCodexProcess(child: ChildProcess): void {
  try {
    if (process.platform !== 'win32') {
      child.kill('SIGTERM');
      return;
    }
    if (child.pid) {
      // eslint-disable-next-line security/detect-child-process -- PID is a numeric process ID from child_process.spawn, not user input
      exec(`taskkill /T /F /PID ${child.pid}`, { timeout: 5000 }, () => {
        try { child.kill(); } catch { /* already dead */ }
      });
    } else {
      try { child.kill(); } catch { /* already dead */ }
    }
  } catch {
    /* already dead */
  }
}

// ---------------------------------------------------------------------------
// Event state appliers
// ---------------------------------------------------------------------------

function applyThreadStarted(event: CodexExecEvent, state: CodexSessionState): void {
  const e = event as CodexThreadStartedEvent;
  if (typeof e.thread_id === 'string') state.threadId = e.thread_id;
}

function applyTurnCompleted(event: CodexExecEvent, state: CodexSessionState): void {
  const e = event as CodexTurnCompletedEvent;
  if (e.usage) state.lastUsage = e.usage;
}

function applyFailure(state: CodexSessionState, message: string | undefined): void {
  state.sawFailureEvent = true;
  if (message !== undefined) state.failureMessage = message;
}

function applyItemCompleted(event: CodexExecEvent, state: CodexSessionState): void {
  const item = (event as CodexItemCompletedEvent).item;
  if (item.type === 'error') applyFailure(state, (item as CodexItemError).message);
}

export function applyCodexEvent(event: CodexExecEvent, state: CodexSessionState): void {
  if (event.type === 'thread.started') applyThreadStarted(event, state);
  else if (event.type === 'turn.completed') applyTurnCompleted(event, state);
  else if (event.type === 'error') applyFailure(state, (event as CodexErrorEvent).message);
  else if (event.type === 'turn.failed') applyFailure(state, (event as CodexTurnFailedEvent).error?.message);
  else if (event.type === 'item.completed') applyItemCompleted(event, state);
}
