/**
 * ipc-handlers/search.ts — Project-wide content search handler.
 *
 * Pure Node.js readline scanner — no external grep dependency.
 * Streams files line-by-line to avoid loading large files into memory.
 */

import { ipcMain, IpcMainInvokeEvent } from 'electron';
import fs from 'fs';
import { minimatch } from 'minimatch';
import path from 'path';
import readline from 'readline';

import type { SearchOptions, SearchResultItem } from '../../renderer/types/electron-runtime-apis';
import log from '../logger';
import { assertPathAllowed } from './pathSecurity';

// Directories always skipped during recursive walk
const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'out', 'build',
  '.cache', '__pycache__', 'coverage', '.next', '.nuxt',
  '.context',
]);

// Files larger than 1 MB are skipped
const MAX_FILE_BYTES = 1024 * 1024;

// Default cap on total matches returned
const DEFAULT_MAX_RESULTS = 500;

// Bytes to inspect for null-byte binary detection
const BINARY_CHECK_BYTES = 512;

 
// eslint-disable-next-line security/detect-non-literal-regexp -- safe: built from static char codes to avoid no-control-regex violation
const ANSI_RE = new RegExp(
  '[' + String.fromCharCode(0x1b, 0x9b) + '][[()#;?]*(?:\\d{1,4}(?:;\\d{0,4})*)?[\\dA-ORZcf-nqry=><]',
  'g',
);

/** Strip ANSI escape sequences from a string. */
function stripAnsi(str: string): string {
  return str.replace(ANSI_RE, '');
}

type SearchResult =
  | { success: true; results: SearchResultItem[]; truncated: boolean }
  | { success: false; error: string };

/** Return true if the buffer contains a null byte (heuristic binary check). */
function isBinaryBuffer(buf: Buffer): boolean {
  const view = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  for (let i = 0; i < view.length; i++) {
    // eslint-disable-next-line security/detect-object-injection -- index is a loop counter, not user input
    if (view[i] === 0) return true;
  }
  return false;
}

/** Escape special regex characters in a literal string. */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

interface BuildPatternOpts {
  query: string;
  isRegex?: boolean;
  caseSensitive?: boolean;
  wholeWord?: boolean;
}

/** Build the match RegExp from search options. Returns null on invalid regex. */
function buildPattern(opts: BuildPatternOpts): RegExp | null {
  const { query, isRegex, caseSensitive, wholeWord } = opts;
  const flags = caseSensitive ? 'g' : 'gi';
  let source = isRegex ? query : escapeRegex(query);
  if (wholeWord) source = `\\b${source}\\b`;
  try {
    // eslint-disable-next-line security/detect-non-literal-regexp -- query is user-supplied; try/catch handles invalid patterns
    return new RegExp(source, flags);
  } catch {
    return null;
  }
}

/** Collect all matches in a single line and return SearchResultItem entries. */
function matchLine(
  pattern: RegExp,
  lineContent: string,
  filePath: string,
  lineNum: number,
): SearchResultItem[] {
  const items: SearchResultItem[] = [];
  pattern.lastIndex = 0;
  let m: RegExpExecArray | null;
  do {
    m = pattern.exec(lineContent);
    if (m) {
      items.push({ filePath, line: lineNum, column: m.index, lineContent, matchLength: m[0].length });
    }
  } while (m !== null && pattern.global);
  return items;
}

/** Return true if the file should be included based on glob filters. */
function passesGlobFilter(filePath: string, includeGlob?: string, excludeGlob?: string): boolean {
  const base = path.basename(filePath);
  if (includeGlob && !minimatch(base, includeGlob) && !minimatch(filePath, includeGlob)) {
    return false;
  }
  if (excludeGlob && (minimatch(base, excludeGlob) || minimatch(filePath, excludeGlob))) {
    return false;
  }
  return true;
}

interface ScanFileOpts {
  filePath: string;
  pattern: RegExp;
  results: SearchResultItem[];
  maxResults: number;
}

/** Scan a single file line-by-line. Returns true when maxResults is reached. */
async function scanFile(opts: ScanFileOpts): Promise<boolean> {
  const { filePath, pattern, results, maxResults } = opts;
  return new Promise((resolve) => {
    let hitLimit = false;
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- filePath comes from validated recursive walk
    const stream = fs.createReadStream(filePath, { encoding: 'utf8' });
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
    let lineNum = 0;

    rl.on('line', (line) => {
      lineNum++;
      if (hitLimit || results.length >= maxResults) {
        hitLimit = true;
        rl.close();
        stream.destroy();
        return;
      }
      const clean = stripAnsi(line);
      const matches = matchLine(pattern, clean, filePath, lineNum);
      for (const m of matches) {
        results.push(m);
        if (results.length >= maxResults) {
          hitLimit = true;
          rl.close();
          stream.destroy();
          return;
        }
      }
    });

    rl.on('close', () => resolve(hitLimit));
    rl.on('error', () => resolve(false));
    stream.on('error', () => resolve(false));
  });
}

/** Return true if the file at fullPath is binary or oversized; false if scannable. */
async function shouldSkipFile(fullPath: string): Promise<boolean> {
  let stat: fs.Stats;
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- path comes from validated recursive walk
    stat = await fs.promises.stat(fullPath);
  } catch {
    return true;
  }
  if (stat.size > MAX_FILE_BYTES) return true;
  let fd: fs.promises.FileHandle | undefined;
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- path comes from validated recursive walk
    fd = await fs.promises.open(fullPath, 'r');
    const buf = Buffer.alloc(BINARY_CHECK_BYTES);
    const { bytesRead } = await fd.read(buf, 0, BINARY_CHECK_BYTES, 0);
    return isBinaryBuffer(buf.subarray(0, bytesRead));
  } catch {
    return true;
  } finally {
    await fd?.close();
  }
}

interface WalkOpts {
  pattern: RegExp;
  includeGlob?: string;
  excludeGlob?: string;
  results: SearchResultItem[];
  maxResults: number;
  signal: AbortSignal;
}

/** Process a single directory entry during the walk. Returns true when limit hit. */
async function processEntry(
  entry: fs.Dirent,
  dir: string,
  opts: WalkOpts,
): Promise<boolean> {
  const fullPath = path.join(dir, entry.name);
  if (entry.isDirectory()) {
    if (SKIP_DIRS.has(entry.name)) return false;
    return walkDir(fullPath, opts);
  }
  if (!entry.isFile()) return false;
  if (!passesGlobFilter(fullPath, opts.includeGlob, opts.excludeGlob)) return false;
  if (await shouldSkipFile(fullPath)) return false;
  return scanFile({ filePath: fullPath, pattern: opts.pattern, results: opts.results, maxResults: opts.maxResults });
}

/** Recursively walk `dir`, scanning each eligible file. Returns true when limit hit. */
async function walkDir(dir: string, opts: WalkOpts): Promise<boolean> {
  if (opts.signal.aborted) return false;
  let entries: fs.Dirent[];
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- dir comes from validated recursive walk
    entries = await fs.promises.readdir(dir, { withFileTypes: true });
  } catch (err) {
    log.warn(`[search] Cannot read dir ${dir}:`, err);
    return false;
  }
  for (const entry of entries) {
    if (opts.signal.aborted) return false;
    const done = await processEntry(entry, dir, opts);
    if (done) return true;
  }
  return false;
}

/** Validate args and build the search pattern, returning an error result if invalid. */
function validateSearchArgs(
  query: string,
  options?: SearchOptions,
): RegExp | { success: false; error: string } {
  if (!query || query.length === 0) return /(?:)/g;
  const pattern = buildPattern({
    query,
    isRegex: options?.isRegex,
    caseSensitive: options?.caseSensitive,
    wholeWord: options?.wholeWord,
  });
  if (!pattern) return { success: false, error: `Invalid regular expression: ${query}` };
  return pattern;
}

interface RunSearchOpts {
  root: string;
  pattern: RegExp;
  options?: SearchOptions;
  signal: AbortSignal;
}

/** Execute the walk and return a result. Isolated for complexity budgeting. */
async function runSearch(opts: RunSearchOpts): Promise<SearchResult> {
  const { root, pattern, options, signal } = opts;
  const maxResults = options?.maxResults ?? DEFAULT_MAX_RESULTS;
  const results: SearchResultItem[] = [];
  try {
    const truncated = await walkDir(root, {
      pattern,
      includeGlob: options?.includeGlob,
      excludeGlob: options?.excludeGlob,
      results,
      maxResults,
      signal,
    });
    return { success: true, results, truncated };
  } catch (err) {
    log.error('[search] Unexpected error during search:', err);
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

async function handleSearch(
  event: IpcMainInvokeEvent,
  root: string,
  query: string,
  options?: SearchOptions,
): Promise<SearchResult> {
  const denied = assertPathAllowed(event, root);
  if (denied) return denied;
  if (!query || query.length === 0) return { success: true, results: [], truncated: false };

  const patternOrError = validateSearchArgs(query, options);
  if ('error' in patternOrError) return patternOrError;

  const controller = new AbortController();
  const onDestroyed = () => controller.abort();
  event.sender.once('destroyed', onDestroyed);
  try {
    return await runSearch({ root, pattern: patternOrError, options, signal: controller.signal });
  } finally {
    event.sender.removeListener('destroyed', onDestroyed);
  }
}

export function registerSearchHandlers(): string[] {
  const channels: string[] = [];
  ipcMain.handle('files:search', handleSearch);
  channels.push('files:search');
  return channels;
}
