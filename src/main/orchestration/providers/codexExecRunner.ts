import { type ChildProcess, spawn } from 'child_process';

import type {
  CodexExecProcessHandle,
  CodexExecResult,
  CodexExecSpawnOptions,
  CodexSessionState,
} from './codexExecRunnerHelpers';
import {
  applyCodexEvent,
  buildCodexExecArgs,
  buildProcessEnv,
  killCodexProcess,
  tryParseEvent,
} from './codexExecRunnerHelpers';

// Re-export types consumed by codexAdapter, codexEventHandler, and tests
export type {
  CodexAgentMessageItem,
  CodexCommandExecutionItem,
  CodexErrorEvent,
  CodexExecArgs,
  CodexExecEvent,
  CodexExecProcessHandle,
  CodexExecResult,
  CodexExecSpawnOptions,
  CodexFileChange,
  CodexFileChangeItem,
  CodexItem,
  CodexItemCompletedEvent,
  CodexItemError,
  CodexItemStartedEvent,
  CodexSessionState,
  CodexThreadStartedEvent,
  CodexTurnCompletedEvent,
  CodexTurnFailedEvent,
  CodexTurnStartedEvent,
  CodexUnknownItem,
  CodexUsage,
} from './codexExecRunnerHelpers';

// Re-export buildCodexExecArgs (used directly by tests)
export { buildCodexExecArgs };

const MAX_BUFFER_BYTES = 100 * 1024 * 1024;

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
    try { child.kill(); } catch { /* already dead */ }
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
    const reason = state.failureMessage ?? state.stderrBuf.trim() ?? `Codex exited with code ${code}`;
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
    get threadId() { return state.threadId; },
  };
  handle.result = new Promise<CodexExecResult>((resolve, reject) => {
    const stdoutArgs: CodexStdoutArgs = { state, child, onEvent: options.onEvent, reject };
    child.stdout?.on('data', (chunk: Buffer) => handleCodexStdout(chunk, stdoutArgs));
    child.stderr?.on('data', (chunk: Buffer) => {
      state.stderrBuf += chunk.toString();
      if (state.stderrBuf.length > MAX_BUFFER_BYTES)
        state.stderrBuf = state.stderrBuf.slice(-MAX_BUFFER_BYTES);
    });
    const closeArgs: CodexCloseArgs = { state, startedAt, onEvent: options.onEvent, resolve, reject };
    child.on('close', (code) => handleCodexClose(code, closeArgs));
    child.on('error', (error) => reject(error));
  });
  return handle;
}
