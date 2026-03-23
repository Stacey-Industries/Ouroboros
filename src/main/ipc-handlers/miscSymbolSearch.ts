import { app } from 'electron';
import fs from 'fs/promises';
import path from 'path';

const HISTORY_FILE_NAMES = ['.zsh_history', '.bash_history'] as const;
const MAX_HISTORY_COMMANDS = 500;
const MAX_SYMBOL_FILES = 200;
const MAX_SYMBOLS = 5000;
const MAX_SYMBOL_FILE_BYTES = 500 * 1024;
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.py', '.rs', '.go', '.css']);
const SYMBOL_IGNORE_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'out',
  '__pycache__',
  '.next',
  '.cache',
  'coverage',
  'build',
]);

export interface SymbolEntry {
  name: string;
  type: string;
  filePath: string;
  relativePath: string;
  line: number;
}
interface SymbolSource {
  content: string;
  filePath: string;
  relativePath: string;
}
interface SymbolWalkContext {
  root: string;
  dirPath: string;
}
interface SymbolCandidate {
  type: string;
  name: string;
}

function forEachLine(content: string, visitor: (line: string, lineNumber: number) => void): void {
  let lineNumber = 1;
  for (const line of content.split('\n')) {
    visitor(line, lineNumber);
    lineNumber += 1;
  }
}

function skipWhitespace(text: string, startIndex: number): number {
  let index = startIndex;
  while (index < text.length && text.charCodeAt(index) <= 32) index += 1;
  return index;
}

function isIdentifierStartChar(ch: string): boolean {
  const code = ch.charCodeAt(0);
  return (code >= 65 && code <= 90) || (code >= 97 && code <= 122) || code === 95 || code === 36;
}

function isIdentifierChar(ch: string): boolean {
  const code = ch.charCodeAt(0);
  return isIdentifierStartChar(ch) || (code >= 48 && code <= 57);
}

function readIdentifier(text: string, startIndex: number): string | null {
  const index = skipWhitespace(text, startIndex);
  if (index >= text.length || !isIdentifierStartChar(text.charAt(index))) return null;
  let end = index + 1;
  while (end < text.length && isIdentifierChar(text.charAt(end))) end += 1;
  return text.slice(index, end);
}

function addSymbol(
  symbols: SymbolEntry[],
  source: SymbolSource,
  line: number,
  candidate: SymbolCandidate,
): boolean {
  symbols.push({
    name: candidate.name,
    type: candidate.type,
    filePath: source.filePath,
    relativePath: source.relativePath,
    line,
  });
  return symbols.length >= MAX_SYMBOLS;
}

function stripExportPrefix(line: string): string {
  const trimmed = line.trimStart();
  return trimmed.startsWith('export ') ? trimmed.slice('export '.length).trimStart() : trimmed;
}

function parseFunctionSymbol(line: string): SymbolCandidate | null {
  const body = stripExportPrefix(line);
  if (body.startsWith('function ')) {
    const name = readIdentifier(body, 'function '.length);
    return name ? { type: 'function', name } : null;
  }
  if (body.startsWith('async function ')) {
    const name = readIdentifier(body, 'async function '.length);
    return name ? { type: 'function', name } : null;
  }
  return null;
}

function parseClassSymbol(line: string): SymbolCandidate | null {
  const body = stripExportPrefix(line);
  if (body.startsWith('class ')) {
    const name = readIdentifier(body, 'class '.length);
    return name ? { type: 'class', name } : null;
  }
  if (body.startsWith('abstract class ')) {
    const name = readIdentifier(body, 'abstract class '.length);
    return name ? { type: 'class', name } : null;
  }
  return null;
}

function parseInterfaceSymbol(line: string): SymbolCandidate | null {
  const body = stripExportPrefix(line);
  if (!body.startsWith('interface ')) return null;
  const name = readIdentifier(body, 'interface '.length);
  return name ? { type: 'interface', name } : null;
}

function parseTypeSymbol(line: string): SymbolCandidate | null {
  const body = stripExportPrefix(line);
  if (!body.startsWith('type ')) return null;
  const name = readIdentifier(body, 'type '.length);
  return name ? { type: 'type', name } : null;
}

function parseConstSymbol(line: string): SymbolCandidate | null {
  const body = stripExportPrefix(line);
  const keywordLength = body.startsWith('const ')
    ? 'const '.length
    : body.startsWith('let ')
      ? 'let '.length
      : body.startsWith('var ')
        ? 'var '.length
        : 0;
  if (!keywordLength) return null;
  const name = readIdentifier(body, keywordLength);
  return name ? { type: 'const', name } : null;
}

function parseDefSymbol(line: string): SymbolCandidate | null {
  const body = stripExportPrefix(line);
  if (!body.startsWith('def ')) return null;
  const name = readIdentifier(body, 'def '.length);
  return name ? { type: 'def', name } : null;
}

function parseRustFnSymbol(line: string): SymbolCandidate | null {
  let body = stripExportPrefix(line);
  if (body.startsWith('pub ')) body = body.slice('pub '.length).trimStart();
  if (body.startsWith('async ')) body = body.slice('async '.length).trimStart();
  if (!body.startsWith('fn ')) return null;
  const name = readIdentifier(body, 'fn '.length);
  return name ? { type: 'fn', name } : null;
}

function collectSymbolsFromLine(
  line: string,
  lineNumber: number,
  source: SymbolSource,
  symbols: SymbolEntry[],
): boolean {
  const candidate =
    parseFunctionSymbol(line) ??
    parseClassSymbol(line) ??
    parseInterfaceSymbol(line) ??
    parseTypeSymbol(line) ??
    parseConstSymbol(line) ??
    parseDefSymbol(line) ??
    parseRustFnSymbol(line);
  return candidate ? addSymbol(symbols, source, lineNumber, candidate) : false;
}

function extractHistoryCommand(line: string): string | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  const zshMatch = trimmed.match(/^:\s*\d+:\d+;(.+)$/);
  return zshMatch ? zshMatch[1] : trimmed.startsWith(':') ? null : trimmed;
}

function dedupeRecentCommands(commands: string[]): string[] {
  const seen = new Set<string>();
  const deduped: string[] = [];
  for (let index = commands.length - 1; index >= 0; index -= 1) {
    // eslint-disable-next-line security/detect-object-injection -- index is a numeric loop variable
    const command = commands[index].trim();
    if (!command || seen.has(command)) continue;
    seen.add(command);
    deduped.push(command);
    if (deduped.length >= MAX_HISTORY_COMMANDS) break;
  }
  return deduped;
}

async function readHistoryFile(filePath: string): Promise<string[] | null> {
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- filePath derived from app.getPath('home') + constant filename, not user input
    const raw = await fs.readFile(filePath, 'utf-8');
    return dedupeRecentCommands(
      raw
        .split('\n')
        .map(extractHistoryCommand)
        .filter((command): command is string => Boolean(command)),
    );
  } catch {
    return null;
  }
}

export async function readShellHistory(): Promise<string[]> {
  const homeDir = app.getPath('home');
  for (const fileName of HISTORY_FILE_NAMES) {
    const commands = await readHistoryFile(path.join(homeDir, fileName));
    if (commands) return commands;
  }
  return [];
}

function collectMatches(source: SymbolSource, symbols: SymbolEntry[]): boolean {
  let shouldStopNow = false;
  forEachLine(source.content, (line, lineNumber) => {
    if (shouldStopNow || symbols.length >= MAX_SYMBOLS) {
      shouldStopNow = true;
      return;
    }
    if (collectSymbolsFromLine(line, lineNumber, source, symbols))
      shouldStopNow = symbols.length >= MAX_SYMBOLS;
  });
  return shouldStopNow;
}

async function addSymbolsFromFile(
  root: string,
  filePath: string,
  symbols: SymbolEntry[],
): Promise<void> {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- filePath derived from root + entry name from readdir, path validated upstream by assertPathAllowed
  const stat = await fs.stat(filePath);
  if (stat.size > MAX_SYMBOL_FILE_BYTES) return;
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- filePath derived from root + entry name from readdir, path validated upstream by assertPathAllowed
  const content = await fs.readFile(filePath, 'utf-8');
  collectMatches(
    { content, filePath, relativePath: path.relative(root, filePath).replace(/\\/g, '/') },
    symbols,
  );
}

function shouldStop(fileCount: number, symbolCount: number): boolean {
  return fileCount >= MAX_SYMBOL_FILES || symbolCount >= MAX_SYMBOLS;
}

async function walkForSymbols(
  root: string,
  dirPath: string,
  symbols: SymbolEntry[],
  counts: { files: number },
): Promise<void> {
  if (shouldStop(counts.files, symbols.length)) return;
  let entries: import('fs').Dirent[];
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- dirPath derived from root + recursive readdir traversal, root validated upstream by assertPathAllowed
    entries = await fs.readdir(dirPath, { withFileTypes: true });
  } catch {
    return;
  }
  const childDirectories = getChildDirectories(entries, dirPath);
  await collectDirectorySymbols({ root, dirPath }, entries, symbols, counts);
  await walkChildDirectories(root, childDirectories, symbols, counts);
}

export async function searchSymbols(root: string): Promise<SymbolEntry[]> {
  const symbols: SymbolEntry[] = [];
  await walkForSymbols(root, root, symbols, { files: 0 });
  return symbols;
}

function getChildDirectories(entries: import('fs').Dirent[], dirPath: string): string[] {
  return entries
    .filter((entry) => entry.isDirectory() && !SYMBOL_IGNORE_DIRS.has(entry.name))
    .map((entry) => path.join(dirPath, entry.name));
}

async function collectDirectorySymbols(
  context: SymbolWalkContext,
  entries: import('fs').Dirent[],
  symbols: SymbolEntry[],
  counts: { files: number },
): Promise<void> {
  for (const entry of entries) {
    if (!shouldProcessEntry(entry, counts.files, symbols.length)) continue;
    const filePath = path.join(context.dirPath, entry.name);
    try {
      await addSymbolsFromFile(context.root, filePath, symbols);
      counts.files += 1;
    } catch {
      // Skip unreadable files.
    }
  }
}

function shouldProcessEntry(
  entry: import('fs').Dirent,
  fileCount: number,
  symbolCount: number,
): boolean {
  if (!entry.isFile() || shouldStop(fileCount, symbolCount)) return false;
  return SOURCE_EXTENSIONS.has(path.extname(entry.name).toLowerCase());
}

async function walkChildDirectories(
  root: string,
  childDirectories: string[],
  symbols: SymbolEntry[],
  counts: { files: number },
): Promise<void> {
  for (const childDir of childDirectories) {
    if (shouldStop(counts.files, symbols.length)) return;
    await walkForSymbols(root, childDir, symbols, counts);
  }
}
