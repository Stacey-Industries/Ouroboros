/**
 * dump-ipc-channels.ts — Scan src/main/ and src/shared/ipc/ for IPC channel
 * name string literals and return a deduplicated sorted list.
 *
 * Used by channelCatalogCoverage.test.ts to replace the hand-maintained
 * HANDLER_REGISTRY_CHANNELS static list. Any new ipcMain.handle(…) call
 * that registers a channel not in the catalog or allowlist will be caught
 * automatically by the coverage test.
 *
 * Scan strategy:
 *  1. Match string literals in the form 'namespace:action' or "namespace:action"
 *     where namespace is all-lowercase letters and action starts with a letter.
 *  2. The match requires the string to be immediately followed by ,  )  ]  or :
 *     (function call argument, array element, object key). This excludes
 *     Node.js bare import specifiers like 'node:crypto' which are followed by
 *     a semicolon or a newline, not a punctuator.
 *  3. Sources: all .ts files under src/main/ (excluding *.test.ts, *.d.ts) and
 *     src/shared/ipc/ (channel constant definitions).
 *  4. Known non-channel strings that happen to match the pattern are listed in
 *     SCAN_NOISE and excluded from the result.
 *
 * Wave 41 Phase B — replaces HANDLER_REGISTRY_CHANNELS static list.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

/**
 * Channel name regex: lowercase namespace, colon, letter-led action (with optional hyphens).
 * Matches: 'agentChat:createThread', 'pty:spawn', 'ai:generate-commit-message', 'window:close-self'
 *
 * The lookahead `(?:\s*[,)\]:])`  requires that the closing quote is
 * immediately followed (after optional whitespace) by a call/array/object
 * punctuator. This is true for:
 *   ipcMain.handle('x:y', ...)       → trailing ,
 *   channels.push('x:y')             → trailing )
 *   ['x:y', handler]                 → trailing ,
 *   { key: 'x:y' }                   → trailing ,
 *   x: 'x:y',                        → trailing ,
 *
 * It is NOT true for:
 *   import crypto from 'node:crypto'; → trailing ; (excluded)
 *   import { foo } from 'node:fs'     → trailing ' at EOL (excluded)
 */
const CHANNEL_LITERAL_RE =
  /['"]([a-z][a-zA-Z0-9]*:[a-zA-Z][a-zA-Z0-9-]*)['"](?:\s*[,)\]:])/g;

/**
 * Strings that match CHANNEL_LITERAL_RE but are definitively not IPC channels.
 * These appear as string values in non-handler contexts (config schemas,
 * shell env vars, doc strings) and would otherwise produce false positives.
 */
const SCAN_NOISE = new Set<string>([
  // Config schema tool IDs — not IPC channels
  'builtin:explain',
  'builtin:fix-build',
  'builtin:refactor',
  'builtin:review-pr',
  'builtin:write-tests',
  // Shell env var value — not an IPC channel
  'ignoredups:erasedups',
  // Comment / doc string — not an IPC channel
  'providerId:modelId',
  // Crash log tag passed as a string argument — not an IPC channel name
  'renderer:render-process-gone',
]);

/** Walk a directory recursively, yielding absolute file paths for *.ts files. */
function* walkTs(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      yield* walkTs(full);
    } else if (entry.endsWith('.ts') && !entry.endsWith('.test.ts') && !entry.endsWith('.d.ts')) {
      yield full;
    }
  }
}

/**
 * Extract all IPC channel name literals from a source file.
 * Returns the set of channel names found (before noise filtering).
 */
function extractChannelsFromFile(filePath: string): Set<string> {
  const src = readFileSync(filePath, 'utf8');
  const found = new Set<string>();
  // Reset lastIndex each call — the regex is stateful with the /g flag.
  CHANNEL_LITERAL_RE.lastIndex = 0;
  let m = CHANNEL_LITERAL_RE.exec(src);
  while (m !== null) {
    found.add(m[1]);
    m = CHANNEL_LITERAL_RE.exec(src);
  }
  return found;
}

function collectFromDir(dir: string, all: Set<string>): void {
  for (const file of walkTs(dir)) {
    for (const ch of extractChannelsFromFile(file)) {
      if (!SCAN_NOISE.has(ch)) {
        all.add(ch);
      }
    }
  }
}

/**
 * Scan src/main/ and src/shared/ipc/ for IPC channel name literals.
 *
 * Returns a sorted, deduplicated array of channel name strings, with known
 * non-channel false positives (SCAN_NOISE) excluded.
 *
 * @param projectRoot - Absolute path to the repository root.
 */
export function scanIpcChannels(projectRoot: string): readonly string[] {
  const scanDirs = [
    path.join(projectRoot, 'src', 'main'),
    path.join(projectRoot, 'src', 'shared', 'ipc'),
  ];

  const all = new Set<string>();
  for (const dir of scanDirs) {
    collectFromDir(dir, all);
  }

  return Array.from(all).sort();
}
