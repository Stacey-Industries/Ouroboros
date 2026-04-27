/**
 * settingsFileUtils.ts — Shared utilities for reading Claude Code settings files
 * with EMFILE retry to survive file-descriptor pressure spikes.
 *
 * Only call sites that THROW on non-ENOENT errors should use readSettingsFileWithRetry.
 * Call sites that intentionally swallow all errors (mcp.ts, codemodeManager.ts)
 * keep their own local copies until a future cleanup wave.
 */

import fs from 'fs/promises';

import log from '../logger';

// ─── EMFILE retry constants ───────────────────────────────────────────────────

const EMFILE_MAX_RETRIES = 3;
const EMFILE_RETRY_BASE_DELAY_MS = 100;
const EMFILE_RETRY_MAX_DELAY_MS = 800;

function isRetryableError(err: unknown): boolean {
  const c = (err as NodeJS.ErrnoException).code;
  return c === 'EMFILE' || c === 'ENFILE';
}

function isNotFoundError(err: unknown): boolean {
  return (err as NodeJS.ErrnoException).code === 'ENOENT';
}

function retryDelay(attempt: number): number {
  return Math.min(EMFILE_RETRY_BASE_DELAY_MS * 2 ** attempt, EMFILE_RETRY_MAX_DELAY_MS);
}

async function sleep(ms: number): Promise<void> {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

// ─── Single-attempt read ──────────────────────────────────────────────────────

type ReadAttemptResult =
  | { status: 'ok'; data: Record<string, unknown> }
  | { status: 'not-found' }
  | { status: 'retryable'; err: unknown }
  | { status: 'fatal'; err: unknown };

async function attemptRead(filePath: string): Promise<ReadAttemptResult> {
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- caller passes getGlobalSettingsPath/getProjectSettingsPath result
    const raw = await fs.readFile(filePath, 'utf-8');
    return { status: 'ok', data: JSON.parse(raw) as Record<string, unknown> };
  } catch (err: unknown) {
    if (isNotFoundError(err)) return { status: 'not-found' };
    if (isRetryableError(err)) return { status: 'retryable', err };
    return { status: 'fatal', err };
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Read and parse a JSON settings file with EMFILE retry.
 *
 * - ENOENT → returns `{}` (file not yet created — expected for first use)
 * - EMFILE / ENFILE → retries up to EMFILE_MAX_RETRIES times with exponential backoff
 * - Other errors → throws (parse failures, permission errors, etc.)
 *
 * Matches the error contract of the original readSettingsFile in mcpStore.ts —
 * the retry is additive; semantics are unchanged.
 */
export async function readSettingsFileWithRetry(
  filePath: string,
): Promise<Record<string, unknown>> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= EMFILE_MAX_RETRIES; attempt++) {
    const result = await attemptRead(filePath);

    if (result.status === 'ok') return result.data;
    if (result.status === 'not-found') return {};
    if (result.status === 'fatal') {
      log.error(`[settingsFileUtils] Failed to read settings file ${filePath}:`, result.err);
      throw result.err;
    }

    // retryable (EMFILE / ENFILE)
    lastError = result.err;
    if (attempt < EMFILE_MAX_RETRIES) {
      log.warn(
        `[settingsFileUtils] EMFILE reading ${filePath} (attempt ${attempt + 1}/${EMFILE_MAX_RETRIES}) — retrying`,
      );
      await sleep(retryDelay(attempt));
    }
  }

  log.error(
    `[settingsFileUtils] EMFILE reading ${filePath} — exhausted ${EMFILE_MAX_RETRIES} retries`,
  );
  throw lastError;
}
