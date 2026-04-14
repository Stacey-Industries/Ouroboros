/**
 * aiStreamHandler — streaming inline edit IPC handler.
 *
 * Spawns `claude -p --output-format stream-json`, parses NDJSON deltas from
 * stdout, and forwards token/done/error events to the renderer via
 * webContents.send('ai:inlineEditStream:<requestId>', event).
 *
 * Never calls the Anthropic SDK directly — all generation routes through the
 * claude CLI (OAuth/CLI-only constraint per user memory).
 *
 * Cancellation is supported via a per-requestId process registry.
 */
import { type ChildProcess, exec, spawn } from 'child_process';
import type { IpcMainInvokeEvent } from 'electron';
import { ipcMain } from 'electron';

import type {
  InlineEditStreamCancelRequest,
  InlineEditStreamRequest,
} from '../../shared/types/inlineEditStream';
import { getConfigValue } from '../config';
import log from '../logger';
import { buildStreamJsonArgs } from '../orchestration/providers/claudeStreamJsonRunner';
import type {
  StreamJsonAssistantEvent,
  StreamJsonEvent,
} from '../orchestration/providers/streamJsonTypes';

// ── Process registry ──────────────────────────────────────────────────────────

const activeStreams = new Map<string, ChildProcess>();

const MAX_BUF = 100 * 1024 * 1024;

// ── Prompt builder ────────────────────────────────────────────────────────────

function buildPrompt(req: InlineEditStreamRequest): string {
  const { filePath, instruction, selectedText, range } = req;
  return [
    'Edit the following code according to the instruction.',
    'Return ONLY the edited code. No explanations, no markdown fences.',
    '',
    `File: ${filePath}`,
    `Lines ${range.startLine}-${range.endLine}`,
    '',
    '<code>',
    selectedText,
    '</code>',
    '',
    `Instruction: ${instruction}`,
  ].join('\n');
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function extractTextDelta(event: StreamJsonAssistantEvent): string {
  const content = event.message?.content;
  if (!Array.isArray(content)) return '';
  for (const block of content) {
    if (block.type === 'text' && typeof block.text === 'string') return block.text;
  }
  return '';
}

function killProcess(child: ChildProcess): void {
  try {
    if (process.platform !== 'win32') { child.kill('SIGTERM'); return; }
    if (child.pid) {
      const pid = child.pid;
      // eslint-disable-next-line security/detect-child-process -- PID is a numeric integer from child_process.spawn, not user input
      exec(`taskkill /T /F /PID ${pid}`, { timeout: 5000 }, () => {
        try { child.kill(); } catch { /* already dead */ }
      });
    } else {
      try { child.kill(); } catch { /* already dead */ }
    }
  } catch { /* already dead */ }
}

function tryParseStreamLine(line: string): StreamJsonEvent | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed.type === 'string') return parsed as StreamJsonEvent;
    return null;
  } catch { return null; }
}

// ── Stream state ──────────────────────────────────────────────────────────────

interface StreamState {
  requestId: string;
  sender: Electron.WebContents;
  stdoutBuf: string;
  stderrBuf: string;
  finalText: string;
  emittedLength: number;
}

function sendEvent(state: StreamState, payload: unknown): void {
  if (state.sender.isDestroyed()) return;
  state.sender.send(`ai:inlineEditStream:${state.requestId}`, payload);
}

function onStreamEvent(event: StreamJsonEvent, state: StreamState): void {
  if (event.type !== 'assistant') return;
  const text = extractTextDelta(event as StreamJsonAssistantEvent);
  if (text.length > state.emittedLength) {
    const delta = text.slice(state.emittedLength);
    state.emittedLength = text.length;
    state.finalText = text;
    sendEvent(state, { type: 'token', delta });
  }
}

// ── Stdout + close handlers ───────────────────────────────────────────────────

function processStdoutChunk(chunk: Buffer, state: StreamState, child: ChildProcess): void {
  state.stdoutBuf += chunk.toString();
  if (state.stdoutBuf.length > MAX_BUF) {
    log.error('[ai:streamInlineEdit] stdout exceeded limit, killing process');
    sendEvent(state, { type: 'error', message: 'Response too large' });
    killProcess(child);
    return;
  }
  let idx: number;
  while ((idx = state.stdoutBuf.indexOf('\n')) !== -1) {
    const line = state.stdoutBuf.slice(0, idx);
    state.stdoutBuf = state.stdoutBuf.slice(idx + 1);
    const ev = tryParseStreamLine(line);
    if (ev) onStreamEvent(ev, state);
  }
}

type StreamResult = { success: boolean; requestId?: string; error?: string };

function onProcessClose(
  code: number | null,
  state: StreamState,
  requestId: string,
  resolve: (r: StreamResult) => void,
): void {
  activeStreams.delete(requestId);
  if (code !== 0 && code !== null) {
    const msg = state.stderrBuf.trim() || `claude exited with code ${code}`;
    sendEvent(state, { type: 'error', message: msg });
    resolve({ success: false, error: msg });
  } else {
    sendEvent(state, { type: 'done', finalText: state.finalText });
    resolve({ success: true, requestId });
  }
}

// ── Public handlers ───────────────────────────────────────────────────────────

export function handleStreamInlineEdit(
  event: IpcMainInvokeEvent,
  req: InlineEditStreamRequest,
): Promise<StreamResult> {
  const { requestId } = req;
  const sender = event.sender;
  const prompt = buildPrompt(req);
  const cwd = (getConfigValue('defaultProjectRoot') as string) || process.cwd();
  const { command, args } = buildStreamJsonArgs({ prompt, cwd });

  const child = spawn(command, args, {
    cwd,
    env: { ...process.env, TERM: 'xterm-256color' } as Record<string, string>,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  if (child.stdin) { child.stdin.write(prompt); child.stdin.end(); }
  activeStreams.set(requestId, child);

  const state: StreamState = {
    requestId, sender, stdoutBuf: '', stderrBuf: '', finalText: '', emittedLength: 0,
  };

  return new Promise<StreamResult>((resolve) => {
    child.stdout?.on('data', (chunk: Buffer) => processStdoutChunk(chunk, state, child));
    child.stderr?.on('data', (chunk: Buffer) => {
      state.stderrBuf += chunk.toString();
      if (state.stderrBuf.length > MAX_BUF) state.stderrBuf = state.stderrBuf.slice(-MAX_BUF);
    });
    child.on('close', (code) => onProcessClose(code, state, requestId, resolve));
    child.on('error', (err) => {
      activeStreams.delete(requestId);
      log.warn('[ai:streamInlineEdit] spawn error:', err.message);
      sendEvent(state, { type: 'error', message: err.message });
      resolve({ success: false, error: err.message });
    });
  });
}

export async function handleCancelInlineEditStream(
  _event: IpcMainInvokeEvent,
  req: InlineEditStreamCancelRequest,
): Promise<{ success: boolean }> {
  const child = activeStreams.get(req.requestId);
  if (!child) return { success: true };
  activeStreams.delete(req.requestId);
  killProcess(child);
  return { success: true };
}

// ── Registration ──────────────────────────────────────────────────────────────

export function registerAiStreamHandlers(): string[] {
  ipcMain.handle('ai:streamInlineEdit', handleStreamInlineEdit);
  ipcMain.handle('ai:cancelInlineEditStream', handleCancelInlineEditStream);
  return ['ai:streamInlineEdit', 'ai:cancelInlineEditStream'];
}
