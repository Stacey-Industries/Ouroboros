/**
 * ptyShellIntegration.ts — Parses VS Code-style OSC 633 shell integration
 * sequences from PTY output.
 *
 * The shell scripts in src/main/shellIntegration/ emit these sequences.
 * This module strips them from the visible output and updates a per-session
 * ShellState record that the renderer can query via IPC.
 *
 * Sequence reference (OSC = \x1b] ... \x07):
 *   633;A          — Prompt start
 *   633;B          — Command start (after Enter)
 *   633;C          — Command executing (output begins)
 *   633;D;<code>   — Command finished with exit code
 *   633;E;<cmd>    — Command line text
 *   633;P;Cwd=<p>  — Property: current working directory
 *   7;<uri>        — CWD via OSC 7 (file:// URI or raw path)
 *
 * Performance note: this runs on every byte of PTY output. All matching is
 * done by scanning for the OSC introducer rather than running regexes on the
 * full string.
 */

/** State for one PTY session's shell integration. */
export interface ShellState {
  /** Last known working directory (from 633;P;Cwd= or OSC 7). */
  cwd: string;
  /** Exit code of the most-recently-completed command, or null if unknown. */
  lastExitCode: number | null;
  /** Command line of the most-recently-completed command, or null. */
  lastCommand: string | null;
  /** True while a command is executing (between C and D sequences). */
  isExecuting: boolean;
}

/** Returns a fresh ShellState with default values. */
export function makeShellState(initialCwd = ''): ShellState {
  return { cwd: initialCwd, lastExitCode: null, lastCommand: null, isExecuting: false };
}

// OSC introducer and terminator bytes
const OSC_START = '\x1b]';
const OSC_END = '\x07';

/**
 * Extract the payload from a single OSC sequence.
 * Returns null if the string is not a well-formed OSC sequence.
 */
function extractOscPayload(seq: string): string | null {
  if (!seq.startsWith(OSC_START)) return null;
  const endIdx = seq.indexOf(OSC_END, OSC_START.length);
  if (endIdx === -1) return null;
  return seq.slice(OSC_START.length, endIdx);
}

/**
 * Apply a single parsed OSC payload to state.
 * Returns updated state if the sequence is recognised, or null if unknown
 * (caller should preserve the sequence verbatim).
 */
function applyPayload(payload: string, state: ShellState): ShellState | null {
  if (payload.startsWith('633;')) {
    return apply633(payload.slice(4), state);
  }
  if (payload.startsWith('7;')) {
    return applyOsc7(payload.slice(2), state);
  }
  return null;
}

function apply633(body: string, state: ShellState): ShellState {
  if (body === 'A') return { ...state };
  if (body === 'B') return { ...state };
  if (body === 'C') return { ...state, isExecuting: true };
  if (body.startsWith('D;')) {
    const code = parseInt(body.slice(2), 10);
    return {
      ...state,
      isExecuting: false,
      lastExitCode: isNaN(code) ? null : code,
    };
  }
  if (body.startsWith('E;')) {
    return { ...state, lastCommand: body.slice(2) };
  }
  if (body.startsWith('P;Cwd=')) {
    const cwd = body.slice(6);
    return cwd ? { ...state, cwd } : state;
  }
  return state;
}

function applyOsc7(uri: string, state: ShellState): ShellState {
  if (!uri) return state;
  // Strip file:// scheme if present (e.g. file:///home/user/projects → /home/user/projects)
  const cwd = uri.startsWith('file://') ? uri.slice(7) : uri;
  return cwd ? { ...state, cwd } : state;
}

/**
 * Scan `data` for all OSC sequences, apply each to `state`, and return the
 * cleaned string (sequences stripped) plus the updated state.
 *
 * This is the hot path — called on every PTY data chunk. It avoids creating
 * regex engines; instead it does a linear scan for the OSC introducer byte.
 */
export function processShellData(
  data: string,
  state: ShellState,
): { cleaned: string; state: ShellState } {
  let current = state;
  let result = '';
  let pos = 0;

  while (pos < data.length) {
    const esc = data.indexOf(OSC_START, pos);
    if (esc === -1) {
      result += data.slice(pos);
      break;
    }

    // Append everything before the OSC sequence
    result += data.slice(pos, esc);

    const end = data.indexOf(OSC_END, esc + OSC_START.length);
    if (end === -1) {
      // Incomplete sequence — include remainder verbatim (may be split across chunks)
      result += data.slice(esc);
      pos = data.length;
      break;
    }

    const seqEnd = end + OSC_END.length;
    const seq = data.slice(esc, seqEnd);
    const payload = extractOscPayload(seq);
    if (payload !== null) {
      const next = applyPayload(payload, current);
      if (next !== null) {
        current = next;
      } else {
        // Unrecognised OSC — preserve it verbatim
        result += seq;
      }
    } else {
      // Malformed OSC — preserve verbatim
      result += seq;
    }
    pos = seqEnd;
  }

  return { cleaned: result, state: current };
}

/** Per-session shell state map. Keyed by PTY session ID. */
const shellStateMap = new Map<string, ShellState>();

/** Initialise shell state for a new session. */
export function initShellState(id: string, initialCwd: string): void {
  shellStateMap.set(id, makeShellState(initialCwd));
}

/** Process incoming PTY data: strips OSC sequences and updates state. */
export function processAndUpdateState(id: string, data: string): string {
  const state = shellStateMap.get(id);
  if (!state) return data;
  const { cleaned, state: next } = processShellData(data, state);
  shellStateMap.set(id, next);
  return cleaned;
}

/** Get the current shell state for a session, or null if not tracked. */
export function getShellState(id: string): ShellState | null {
  return shellStateMap.get(id) ?? null;
}

/** Remove shell state when a session is cleaned up. */
export function removeShellState(id: string): void {
  shellStateMap.delete(id);
}
