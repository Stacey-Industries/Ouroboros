import fs from 'fs';
import path from 'path';

export const REPRO_OUTPUT_DIR_ENV = 'PW_REPRO_OUTPUT_DIR';

export type ReproSummary = {
  name: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  passed: boolean;
  screenshots: string[];
  consoleTranscriptPath: string;
  tracePath: string | null;
  testFile: string;
};

export type ConsoleEntry = {
  ts: string;
  type: 'log' | 'info' | 'warn' | 'error' | 'debug' | 'dir' | 'trace' | 'pageerror';
  text: string;
  location?: { url: string; line: number; column: number };
};

/**
 * Append a console entry to a JSONL file.
 * One JSON object per line, no trailing comma.
 * Caller must ensure dir exists; this function does not mkdir.
 */
export function appendConsoleEntry(dir: string, entry: ConsoleEntry): void {
  const filePath = path.join(dir, 'console.jsonl');
  fs.appendFileSync(filePath, JSON.stringify(entry) + '\n');
}

/**
 * Write a ReproSummary to a JSON file.
 * Caller must ensure dir exists; this function does not mkdir.
 */
export function writeReproSummary(dir: string, summary: ReproSummary): void {
  const filePath = path.join(dir, 'summary.json');
  fs.writeFileSync(filePath, JSON.stringify(summary, null, 2));
}
