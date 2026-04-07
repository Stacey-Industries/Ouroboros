import { describe, expect, it } from 'vitest';

import {
  getShellState,
  initShellState,
  makeShellState,
  processAndUpdateState,
  processShellData,
  removeShellState,
} from './ptyShellIntegration';

// --- pure processShellData ---------------------------------------------------

describe('processShellData', () => {
  it('passes through plain text unchanged', () => {
    const state = makeShellState('/home/user');
    const { cleaned, state: next } = processShellData('hello world\r\n', state);
    expect(cleaned).toBe('hello world\r\n');
    expect(next.cwd).toBe('/home/user');
  });

  it('strips 633;A (prompt start) and returns unchanged state', () => {
    const state = makeShellState('/a');
    const { cleaned, state: next } = processShellData('\x1b]633;A\x07', state);
    expect(cleaned).toBe('');
    expect(next.cwd).toBe('/a');
    expect(next.isExecuting).toBe(false);
  });

  it('strips 633;C and sets isExecuting=true', () => {
    const state = makeShellState('/a');
    const { cleaned, state: next } = processShellData('\x1b]633;C\x07', state);
    expect(cleaned).toBe('');
    expect(next.isExecuting).toBe(true);
  });

  it('strips 633;D;0 and sets lastExitCode=0 and isExecuting=false', () => {
    const state = { ...makeShellState('/a'), isExecuting: true };
    const { cleaned, state: next } = processShellData('\x1b]633;D;0\x07', state);
    expect(cleaned).toBe('');
    expect(next.lastExitCode).toBe(0);
    expect(next.isExecuting).toBe(false);
  });

  it('strips 633;D;127 and captures non-zero exit code', () => {
    const state = makeShellState('/a');
    const { cleaned, state: next } = processShellData('\x1b]633;D;127\x07', state);
    expect(cleaned).toBe('');
    expect(next.lastExitCode).toBe(127);
  });

  it('strips 633;E and captures command line', () => {
    const state = makeShellState('/a');
    const { cleaned, state: next } = processShellData('\x1b]633;E;git status\x07', state);
    expect(cleaned).toBe('');
    expect(next.lastCommand).toBe('git status');
  });

  it('strips 633;P;Cwd= and updates cwd', () => {
    const state = makeShellState('/old');
    const { cleaned, state: next } = processShellData('\x1b]633;P;Cwd=/new/path\x07', state);
    expect(cleaned).toBe('');
    expect(next.cwd).toBe('/new/path');
  });

  it('strips OSC 7 file:// URI and updates cwd', () => {
    const state = makeShellState('/old');
    const { cleaned, state: next } = processShellData(
      '\x1b]7;file:///home/user/projects\x07',
      state,
    );
    expect(cleaned).toBe('');
    expect(next.cwd).toBe('/home/user/projects');
  });

  it('preserves text around sequences', () => {
    const state = makeShellState('/a');
    const input = 'before\x1b]633;C\x07after';
    const { cleaned } = processShellData(input, state);
    expect(cleaned).toBe('beforeafter');
  });

  it('handles multiple sequences in one chunk', () => {
    const state = makeShellState('/a');
    const input = '\x1b]633;E;echo hi\x07\x1b]633;C\x07output\x1b]633;D;0\x07';
    const { cleaned, state: next } = processShellData(input, state);
    expect(cleaned).toBe('output');
    expect(next.lastCommand).toBe('echo hi');
    expect(next.lastExitCode).toBe(0);
    expect(next.isExecuting).toBe(false);
  });

  it('preserves unrecognised OSC sequences verbatim', () => {
    const state = makeShellState('/a');
    const unknown = '\x1b]999;custom\x07';
    const { cleaned } = processShellData(unknown, state);
    expect(cleaned).toBe(unknown);
  });

  it('preserves incomplete OSC at end of chunk', () => {
    const state = makeShellState('/a');
    const incomplete = 'text\x1b]633;C';
    const { cleaned } = processShellData(incomplete, state);
    expect(cleaned).toBe('text\x1b]633;C');
  });

  it('does not mutate the original state object', () => {
    const state = makeShellState('/original');
    processShellData('\x1b]633;P;Cwd=/changed\x07', state);
    expect(state.cwd).toBe('/original');
  });
});

// --- per-session map helpers -------------------------------------------------

describe('session state map', () => {
  it('initShellState creates state retrievable by getShellState', () => {
    initShellState('sess-1', '/start');
    const s = getShellState('sess-1');
    expect(s).not.toBeNull();
    expect(s?.cwd).toBe('/start');
    removeShellState('sess-1');
  });

  it('processAndUpdateState strips sequences and persists new state', () => {
    initShellState('sess-2', '/init');
    const cleaned = processAndUpdateState('sess-2', '\x1b]633;P;Cwd=/updated\x07hello');
    expect(cleaned).toBe('hello');
    expect(getShellState('sess-2')?.cwd).toBe('/updated');
    removeShellState('sess-2');
  });

  it('getShellState returns null for unknown session', () => {
    expect(getShellState('does-not-exist')).toBeNull();
  });

  it('removeShellState removes the session entry', () => {
    initShellState('sess-3', '/tmp');
    removeShellState('sess-3');
    expect(getShellState('sess-3')).toBeNull();
  });

  it('processAndUpdateState is a no-op for untracked session', () => {
    const result = processAndUpdateState('untracked', 'raw data');
    expect(result).toBe('raw data');
  });
});
