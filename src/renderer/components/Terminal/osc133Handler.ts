/**
 * osc133Handler — OSC 133 shell integration: parses semantic shell sequences
 * from raw PTY output, tracks command blocks, and creates xterm decorations.
 */

import type { Terminal } from '@xterm/xterm';

import type { CommandBlock } from './terminalHelpers';
import { OSC133_GRACE_MS, OSC133_RE } from './terminalHelpers';

export interface Osc133State {
  enabledRef: React.MutableRefObject<boolean | null>;
  graceTimerRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>;
  firstOutputRef: React.MutableRefObject<boolean>;
  currentBlockRef: React.MutableRefObject<CommandBlock | null>;
  decorationDisposablesRef: React.MutableRefObject<Array<{ dispose(): void }>>;
  pendingQueueRef: React.MutableRefObject<
    Array<{
      sequence: string;
      param: string | undefined;
    }>
  >;
}

export function createOsc133State(): Osc133State {
  // These will be initialized as refs in the hook
  return null as unknown as Osc133State;
}

/** Parse and strip OSC 133 sequences from raw PTY output. */
export function parseAndStripOsc133(raw: string, state: Osc133State): string {
  initGracePeriod(state);
  if (state.enabledRef.current === false) return raw;

  OSC133_RE.lastIndex = 0;
  let result = raw;
  let match: RegExpExecArray | null;
  const matches: Array<{
    sequence: string;
    param: string | undefined;
    full: string;
  }> = [];

  while ((match = OSC133_RE.exec(raw)) !== null) {
    matches.push({ sequence: match[1], param: match[2], full: match[0] });
  }

  for (const m of matches) {
    state.pendingQueueRef.current.push({
      sequence: m.sequence,
      param: m.param,
    });
    result = result.replace(m.full, '');
  }
  return result;
}

/** Handle a single OSC 133 event (called after term.write). */
export function handleOsc133Event(
  sequence: string,
  param: string | undefined,
  terminalRef: React.MutableRefObject<Terminal | null>,
  state: Osc133State,
): void {
  const term = terminalRef.current;
  if (!term) return;
  const absRow = term.buffer.active.viewportY + term.buffer.active.cursorY;

  if (sequence === 'A') {
    onPromptStart(absRow, state);
  } else if (sequence === 'C' && state.currentBlockRef.current) {
    state.currentBlockRef.current.outputRow = absRow;
  } else if (sequence === 'D') {
    onCommandEnd(param, terminalRef, state);
  }
}

/** Clean up OSC 133 resources. */
export function cleanupOsc133(state: Osc133State): void {
  if (state.graceTimerRef.current !== null) {
    clearTimeout(state.graceTimerRef.current);
    state.graceTimerRef.current = null;
  }
  for (const d of state.decorationDisposablesRef.current) {
    try {
      d.dispose();
    } catch {
      /* ignore */
    }
  }
  state.decorationDisposablesRef.current = [];
  state.pendingQueueRef.current = [];
}

// ── Internal helpers ────────────────────────────────────────────────────────

function initGracePeriod(state: Osc133State): void {
  if (state.firstOutputRef.current) return;
  state.firstOutputRef.current = true;
  if (state.enabledRef.current !== null) return;
  state.graceTimerRef.current = setTimeout(() => {
    if (state.enabledRef.current === null) {
      state.enabledRef.current = false;
    }
    state.graceTimerRef.current = null;
  }, OSC133_GRACE_MS);
}

function onPromptStart(absRow: number, state: Osc133State): void {
  state.currentBlockRef.current = {
    promptRow: absRow,
    outputRow: null,
    exitCode: -1,
    complete: false,
  };
  state.enabledRef.current = true;
  if (state.graceTimerRef.current !== null) {
    clearTimeout(state.graceTimerRef.current);
    state.graceTimerRef.current = null;
  }
}

function onCommandEnd(
  param: string | undefined,
  terminalRef: React.MutableRefObject<Terminal | null>,
  state: Osc133State,
): void {
  const block = state.currentBlockRef.current;
  if (!block) return;
  block.exitCode = param !== undefined ? parseInt(param, 10) : 0;
  block.complete = true;
  registerBlockDecoration(block, terminalRef, state);
  state.currentBlockRef.current = null;
}

function registerBlockDecoration(
  block: CommandBlock,
  terminalRef: React.MutableRefObject<Terminal | null>,
  state: Osc133State,
): void {
  const term = terminalRef.current;
  if (!term || !block.complete) return;
  try {
    const absCursor = term.buffer.active.viewportY + term.buffer.active.cursorY;
    const offset = block.promptRow - absCursor;
    const height = Math.min(Math.max(1, absCursor - block.promptRow + 1), term.rows * 3);
    const marker = term.registerMarker(offset);
    if (!marker) return;
    const dec = term.registerDecoration({
      marker,
      x: 0,
      width: term.cols,
      height,
      layer: 'bottom',
    });
    if (!dec) return;
    dec.onRender((el) => {
      el.style.cssText = [
        'border-left:2px solid var(--border-default,#333)',
        'background:var(--surface-panel,rgba(30,30,30,0.25))',
        'pointer-events:none',
        'box-sizing:border-box',
        'width:100%',
        'height:100%',
      ].join(';');
    });
    state.decorationDisposablesRef.current.push(dec, marker);
  } catch {
    /* ignore */
  }
}
