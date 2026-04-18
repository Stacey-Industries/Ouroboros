/**
 * crashReporterStorage.ts — Writes crash records to ~/.ouroboros/crash-reports/.
 *
 * Separated from crashReporter.ts so it can be mocked cleanly in tests.
 * The path is built from os.homedir() — never from user-supplied input.
 */

import fs from 'fs/promises';
import os from 'os';
import path from 'path';

import type { CrashRecord } from './crashReporter';
import log from './logger';

function getCrashReportDir(): string {
  return path.join(os.homedir(), '.ouroboros', 'crash-reports');
}

export async function writeCrashRecord(record: CrashRecord): Promise<void> {
  const dir = getCrashReportDir();
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- dir rooted at os.homedir()
  await fs.mkdir(dir, { recursive: true });

  const safestamp = record.timestamp.replace(/[:.]/g, '-');
  const filePath = path.join(dir, `${safestamp}.json`);
  const content = JSON.stringify(record, null, 2);

  // eslint-disable-next-line security/detect-non-literal-fs-filename -- filePath derived from homedir + timestamp
  await fs.writeFile(filePath, content, 'utf-8');
  log.info(`[crashReporter] record written`);
}

/** Returns the directory path for crash reports (used by IPC handler). */
export function getCrashReportDirPath(): string {
  return getCrashReportDir();
}
