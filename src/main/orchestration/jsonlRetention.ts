/**
 * jsonlRetention.ts — Shared helpers for date-stamped JSONL filenames and
 * time-based retention (Wave 29.5 Phase G — M2).
 *
 * Used by contextDecisionWriter, contextOutcomeWriter, and researchOutcomeWriter.
 * Keeps all three in sync on naming conventions and purge logic.
 */

import fs from 'node:fs/promises';
import path from 'node:path';

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Build a date-stamped JSONL filename.
 * Uses UTC dates so filenames are consistent across time zones.
 *
 * @example buildDatedFilename('context-decisions') === 'context-decisions-2026-04-16.jsonl'
 */
export function buildDatedFilename(basename: string, date: Date = new Date()): string {
  const stamp = date.toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
  return `${basename}-${stamp}.jsonl`;
}

/**
 * Remove files matching `${basenameGlob}-YYYY-MM-DD[.N].jsonl` in `dir`
 * whose date-stamp is strictly older than `days` days (UTC).
 * Files whose date cannot be parsed are left untouched.
 * Missing directory is treated as 0 files (returns 0).
 *
 * @returns Count of files removed.
 */
export async function purgeOlderThan(
  dir: string,
  basenameGlob: string,
  days: number,
): Promise<number> {
  let entries: string[];
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- trusted userData path
    entries = await fs.readdir(dir);
  } catch {
    return 0;
  }

  const cutoff = utcDaysAgo(days);
  const pattern = buildRetentionPattern(basenameGlob);
  let removed = 0;

  for (const entry of entries) {
    const date = extractDateFromFilename(entry, pattern);
    if (date === null) continue; // unparseable — leave alone
    if (date < cutoff) {
      try {
        // eslint-disable-next-line security/detect-non-literal-fs-filename -- trusted userData path
        await fs.unlink(path.join(dir, entry));
        removed++;
      } catch {
        // Best-effort — file may have been removed concurrently
      }
    }
  }
  return removed;
}

/**
 * Migrate legacy undated files (`${basename}.jsonl`) to the dated naming
 * scheme using the file's mtime UTC date. Call once at startup before
 * `purgeOlderThan`. No-op if the legacy file does not exist.
 */
export async function migrateLegacyJsonl(dir: string, basename: string): Promise<void> {
  const legacyPath = path.join(dir, `${basename}.jsonl`);
  let stat: Awaited<ReturnType<typeof fs.stat>>;
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- trusted userData path
    stat = await fs.stat(legacyPath);
  } catch {
    return; // File doesn't exist — nothing to migrate
  }

  const dated = buildDatedFilename(basename, stat.mtime);
  const datedPath = path.join(dir, dated);

  // Don't clobber an existing dated file
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- trusted userData path
    await fs.stat(datedPath);
    return; // Target already exists — skip
  } catch {
    // Target missing — proceed with rename
  }

  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- trusted userData path
    await fs.rename(legacyPath, datedPath);
  } catch {
    // Best-effort — leave the legacy file in place if rename fails
  }
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/** Build a RegExp matching `<basenameGlob>-YYYY-MM-DD[.N].jsonl`. */
function buildRetentionPattern(basenameGlob: string): RegExp {
  // Escape the glob literally — basenames are trusted internal constants (no user input)
  const escaped = basenameGlob.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Allow an optional intraday rotation suffix like `.1`, `.2`
  // eslint-disable-next-line security/detect-non-literal-regexp -- basenameGlob is a trusted internal constant
  return new RegExp(`^${escaped}-(\\d{4}-\\d{2}-\\d{2})(?:\\.\\d+)?\\.jsonl$`);
}

/** Extract the UTC date from a filename using the retention pattern. */
function extractDateFromFilename(filename: string, pattern: RegExp): Date | null {
  const match = pattern.exec(filename);
  if (!match) return null;
  const stamp = match[1]; // e.g. '2026-04-16'
  const parsed = new Date(`${stamp}T00:00:00Z`);
  // Reject invalid dates (e.g. '2026-99-99')
  if (isNaN(parsed.getTime())) return null;
  return parsed;
}

/** Return a Date representing midnight UTC `days` days ago. */
function utcDaysAgo(days: number): Date {
  const now = new Date();
  const cutoff = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() - days,
  ));
  return cutoff;
}
