import { type ChildProcess, exec, spawn } from 'child_process';

import {
  CodexAppServerFramingParser,
  encodeCodexAppServerMessage,
} from './codexAppServerFraming';
import type { CodexAppServerIncomingMessage, CodexAppServerOutgoingMessage } from './codexAppServerTypes';

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

function escapePowerShellArg(arg: string): string {
  return `'${arg.replace(/'/g, "''")}'`;
}

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
  return {
    ...process.env,
    TERM: 'xterm-256color',
    COLORTERM: 'truecolor',
    ...extraEnv,
  } as Record<string, string>;
}

function killCodexAppServerProcess(child: ChildProcess): void {
  try {
    if (process.platform !== 'win32') {
      child.kill('SIGTERM');
      return;
    }
    if (child.pid) {
      exec(`taskkill /T /F /PID ${child.pid}`, { timeout: 5000 }, () => {
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
  const messageListeners = new Set<(message: CodexAppServerIncomingMessage) => void>();
  const closeListeners = new Set<(event: CodexAppServerCloseEvent) => void>();
  let stderr = '';
  let resolved = false;
  let resolveClosed: (event: CodexAppServerCloseEvent) => void = () => {};
  const closed = new Promise<CodexAppServerCloseEvent>((resolve) => {
    resolveClosed = resolve;
  });

  child.stdout?.on('data', (chunk: Buffer) => {
    for (const message of parser.push(chunk)) {
      for (const listener of messageListeners) {
        listener(message);
      }
    }
  });
  child.stderr?.on('data', (chunk: Buffer) => {
    stderr += chunk.toString();
  });
  child.on('close', (code, signal) => {
    for (const message of parser.flush()) {
      for (const listener of messageListeners) {
        listener(message);
      }
    }
    const event: CodexAppServerCloseEvent = { code, signal, stderr };
    if (!resolved) {
      resolved = true;
      resolveClosed(event);
    }
    for (const listener of closeListeners) {
      listener(event);
    }
  });

  return {
    get pid() {
      return child.pid;
    },
    get stderr() {
      return stderr;
    },
    closed,
    send(message) {
      if (!child.stdin || child.stdin.destroyed) {
        throw new Error('Codex app-server stdin is not available.');
      }
      child.stdin.write(encodeCodexAppServerMessage(message));
    },
    onMessage(listener) {
      messageListeners.add(listener);
      return () => {
        messageListeners.delete(listener);
      };
    },
    onClose(listener) {
      closeListeners.add(listener);
      return () => {
        closeListeners.delete(listener);
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
