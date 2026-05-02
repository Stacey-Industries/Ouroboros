import { type ChildProcess, spawn } from 'child_process';

import { escapePowerShellArg } from '../../ptyArgEscape';
import { CodexAppServerFramingParser, encodeCodexAppServerMessage } from './codexAppServerFraming';
import type {
  CodexAppServerIncomingMessage,
  CodexAppServerOutgoingMessage,
} from './codexAppServerTypes';
import { withStableWindowsShellEnv } from './codexWindowsShellEnv';

export interface CodexAppServerSpawnOptions {
  cwd: string;
  env?: Record<string, string>;
  cliArgs?: string[];
}

export interface CodexAppServerCloseEvent {
  code: number | null;
  signal: NodeJS.Signals | null;
  stderr: string;
}

export interface CodexAppServerProcessHandle {
  readonly pid?: number;
  readonly stderr: string;
  readonly closed: Promise<CodexAppServerCloseEvent>;
  send: (message: CodexAppServerOutgoingMessage) => void;
  onMessage: (listener: (message: CodexAppServerIncomingMessage) => void) => () => void;
  onClose: (listener: (event: CodexAppServerCloseEvent) => void) => () => void;
  close: () => void;
  kill: () => void;
}

const processRegistry = new Map<string, CodexAppServerProcessHandle>();

export function buildCodexAppServerArgs(options: CodexAppServerSpawnOptions): {
  command: string;
  args: string[];
} {
  const codexArgs = ['app-server', ...(options.cliArgs ?? [])];
  if (process.platform === 'win32') {
    const escaped = ['codex', ...codexArgs].map(escapePowerShellArg).join(' ');
    return {
      command: 'powershell.exe',
      args: ['-NoLogo', '-Command', `& ${escaped}`],
    };
  }
  return { command: 'codex', args: codexArgs };
}

function buildProcessEnv(extraEnv?: Record<string, string>): Record<string, string> {
  return withStableWindowsShellEnv({
    ...process.env,
    TERM: 'xterm-256color',
    COLORTERM: 'truecolor',
    ...extraEnv,
  } as Record<string, string>);
}

function killCodexAppServerProcess(child: ChildProcess): void {
  try {
    if (process.platform !== 'win32') {
      child.kill('SIGTERM');
      return;
    }
    if (child.pid) {
      const taskkill = spawn('taskkill', ['/T', '/F', '/PID', String(child.pid)], {
        stdio: 'ignore',
      });
      taskkill.on('close', () => {
        try {
          child.kill();
        } catch {
          /* already dead */
        }
      });
      return;
    }
    child.kill();
  } catch {
    /* already dead */
  }
}

interface ProcessListeners {
  messageListeners: Set<(message: CodexAppServerIncomingMessage) => void>;
  closeListeners: Set<(event: CodexAppServerCloseEvent) => void>;
}

interface WireProcessEventsArgs {
  child: ChildProcess;
  parser: CodexAppServerFramingParser<CodexAppServerIncomingMessage>;
  listeners: ProcessListeners;
  stderrRef: { value: string };
  resolveClosed: (event: CodexAppServerCloseEvent) => void;
  resolvedRef: { value: boolean };
}

function wireProcessEvents(args: WireProcessEventsArgs): void {
  const { child, parser, listeners, stderrRef, resolveClosed, resolvedRef } = args;
  child.stdout?.on('data', (chunk: Buffer) => {
    for (const message of parser.push(chunk)) {
      for (const listener of listeners.messageListeners) listener(message);
    }
  });
  child.stderr?.on('data', (chunk: Buffer) => {
    stderrRef.value += chunk.toString();
  });
  child.on('close', (code, signal) => {
    for (const message of parser.flush()) {
      for (const listener of listeners.messageListeners) listener(message);
    }
    const event: CodexAppServerCloseEvent = { code, signal, stderr: stderrRef.value };
    if (!resolvedRef.value) {
      resolvedRef.value = true;
      resolveClosed(event);
    }
    for (const listener of listeners.closeListeners) listener(event);
  });
}

function buildProcessHandle(
  child: ChildProcess,
  listeners: ProcessListeners,
  stderrRef: { value: string },
  closed: Promise<CodexAppServerCloseEvent>,
): CodexAppServerProcessHandle {
  return {
    get pid() {
      return child.pid;
    },
    get stderr() {
      return stderrRef.value;
    },
    closed,
    send(message) {
      if (!child.stdin || child.stdin.destroyed) {
        throw new Error('Codex app-server stdin is not available.');
      }
      child.stdin.write(encodeCodexAppServerMessage(message));
    },
    onMessage(listener) {
      listeners.messageListeners.add(listener);
      return () => {
        listeners.messageListeners.delete(listener);
      };
    },
    onClose(listener) {
      listeners.closeListeners.add(listener);
      return () => {
        listeners.closeListeners.delete(listener);
      };
    },
    close() {
      child.stdin?.end();
    },
    kill() {
      killCodexAppServerProcess(child);
    },
  };
}

export function spawnCodexAppServerProcess(
  options: CodexAppServerSpawnOptions,
): CodexAppServerProcessHandle {
  const { command, args } = buildCodexAppServerArgs(options);
  const child = spawn(command, args, {
    cwd: options.cwd,
    env: buildProcessEnv(options.env),
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const parser = new CodexAppServerFramingParser<CodexAppServerIncomingMessage>();
  const listeners: ProcessListeners = {
    messageListeners: new Set(),
    closeListeners: new Set(),
  };
  const stderrRef = { value: '' };
  const resolvedRef = { value: false };
  let resolveClosed: (event: CodexAppServerCloseEvent) => void = () => {};
  const closed = new Promise<CodexAppServerCloseEvent>((resolve) => {
    resolveClosed = resolve;
  });
  wireProcessEvents({ child, parser, listeners, stderrRef, resolveClosed, resolvedRef });
  return buildProcessHandle(child, listeners, stderrRef, closed);
}

export async function ensureCodexAppServerProcess(args: {
  cwd: string;
  sessionKey: string;
}): Promise<CodexAppServerProcessHandle> {
  const existing = processRegistry.get(args.sessionKey);
  if (existing) {
    return existing;
  }
  const handle = spawnCodexAppServerProcess({ cwd: args.cwd });
  processRegistry.set(args.sessionKey, handle);
  handle.onClose(() => {
    if (processRegistry.get(args.sessionKey) === handle) {
      processRegistry.delete(args.sessionKey);
    }
  });
  return handle;
}

export async function shutdownCodexAppServerProcesses(): Promise<void> {
  const handles = Array.from(processRegistry.values());
  processRegistry.clear();
  for (const handle of handles) {
    try {
      handle.close();
    } catch {
      /* already closed */
    }
  }
  for (const handle of handles) {
    try {
      handle.kill();
    } catch {
      /* already dead */
    }
  }
  await Promise.allSettled(handles.map(async (handle) => handle.closed));
}

export function resetCodexAppServerProcessesForTests(): void {
  processRegistry.clear();
}
