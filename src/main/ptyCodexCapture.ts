/**
 * ptyCodexCapture.ts — Scans Codex CLI session storage to find the thread ID
 * for an interactive terminal session, matched by CWD and spawn time.
 *
 * Codex rollout files live at:
 *   ~/.codex/sessions/YYYY/MM/DD/rollout-<ISO-datetime>-<thread-uuid>.jsonl
 *
 * The first line of each file is a JSON session_meta record whose payload
 * contains the CWD the session was started from.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';

export interface CodexThreadCaptureArgs {
  cwd: string;
  spawnedAfter: number; // Unix ms timestamp
}

export interface CodexThreadCaptureResult {
  success: boolean;
  threadId?: string;
  error?: string;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Returns ~/.codex/sessions/YYYY/MM/DD with zero-padded month and day. */
function getCodexSessionDir(date: Date): string {
  const yyyy = date.getFullYear().toString();
  const mm = (date.getMonth() + 1).toString().padStart(2, '0');
  const dd = date.getDate().toString().padStart(2, '0');
  return path.join(os.homedir(), '.codex', 'sessions', yyyy, mm, dd);
}

/**
 * Extracts the UUID thread ID from a rollout filename.
 * Expected pattern: rollout-<datetime>-<uuid>.jsonl
 */
export function extractThreadIdFromFilename(filename: string): string | null {
  const match = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.jsonl$/.exec(
    filename,
  );
  return match ? match[1] : null;
}

/**
 * Extracts the file creation timestamp from a rollout filename.
 * The datetime segment (e.g. 2026-03-21T00-30-01) is between "rollout-" and the UUID.
 * Returns Unix ms, or null if the filename doesn't match the expected pattern.
 */
export function extractTimestampFromFilename(filename: string): number | null {
  const match = /rollout-(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2})-/.exec(filename);
  if (!match) return null;
  // Replace the time-portion dashes with colons to form a valid ISO string.
  const raw = match[1]; // e.g. "2026-03-21T00-30-01"
  const iso = raw.replace(/T(\d{2})-(\d{2})-(\d{2})$/, 'T$1:$2:$3');
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : ms;
}

/**
 * Opens a rollout JSONL file and reads only the first line, then parses it
 * to extract the session CWD from payload.cwd.
 */
async function readRolloutCwd(filePath: string): Promise<string | null> {
  let fileHandle: fs.promises.FileHandle | null = null;
  try {
    fileHandle = await fs.promises.open(filePath, 'r');
    const rl = readline.createInterface({ input: fileHandle.createReadStream(), crlfDelay: Infinity });
    const firstLine = await new Promise<string | null>((resolve) => {
      rl.once('line', (line) => { rl.close(); resolve(line); });
      rl.once('close', () => resolve(null));
    });
    if (!firstLine) return null;
    const parsed: unknown = JSON.parse(firstLine);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const payload = (parsed as Record<string, unknown>).payload;
    if (typeof payload !== 'object' || payload === null) return null;
    return (payload as Record<string, unknown>).cwd as string ?? null;
  } catch {
    return null;
  } finally {
    await fileHandle?.close().catch(() => undefined);
  }
}

/** Normalises a CWD path for comparison (case-insensitive on Windows). */
function normalizeCwd(cwd: string): string {
  const resolved = path.resolve(cwd);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

/**
 * Scans today's Codex session directory for a rollout file that was created
 * after `args.spawnedAfter` and whose embedded CWD matches `args.cwd`.
 * Returns the matching thread UUID, or null if none found.
 */
async function findMatchingRollout(args: CodexThreadCaptureArgs): Promise<string | null> {
  const sessionDir = getCodexSessionDir(new Date());
  let entries: string[];
  try {
    entries = await fs.promises.readdir(sessionDir);
  } catch {
    return null; // directory doesn't exist yet — no sessions today
  }

  const candidates = entries
    .filter((f) => f.startsWith('rollout-') && f.endsWith('.jsonl'))
    .filter((f) => {
      const ts = extractTimestampFromFilename(f);
      return ts !== null && ts > args.spawnedAfter;
    })
    .sort((a, b) => {
      const tsA = extractTimestampFromFilename(a) ?? 0;
      const tsB = extractTimestampFromFilename(b) ?? 0;
      return tsB - tsA; // newest first
    });

  const normalTarget = normalizeCwd(args.cwd);

  for (const filename of candidates) {
    const filePath = path.join(sessionDir, filename);
    const rolloutCwd = await readRolloutCwd(filePath);
    if (rolloutCwd !== null && normalizeCwd(rolloutCwd) === normalTarget) {
      return extractThreadIdFromFilename(filename);
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Resolves the Codex thread ID for a terminal session by CWD + spawn time. */
export async function resolveCodexThreadId(
  args: CodexThreadCaptureArgs,
): Promise<CodexThreadCaptureResult> {
  try {
    const threadId = await findMatchingRollout(args);
    return threadId ? { success: true, threadId } : { success: true };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}
