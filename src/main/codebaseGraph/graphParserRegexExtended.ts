/**
 * graphParserRegexExtended.ts — Low-level string utilities and parse helpers
 * used by graphParserRegex.ts. Separated to keep both files under 300 lines.
 */

import type { GraphNode } from './graphTypes';

// ─── Constants ───────────────────────────────────────────────────────────────

export const SKIP_METHOD_NAMES = new Set([
  'constructor',
  'if',
  'for',
  'while',
  'switch',
  'catch',
  'return',
  'new',
  'throw',
]);

export const METHOD_PREFIXES = [
  'public ',
  'private ',
  'protected ',
  'static ',
  'async ',
  'readonly ',
  'override ',
  'get ',
  'set ',
] as const;

// ─── Interfaces ───────────────────────────────────────────────────────────────

export interface RegexCtx {
  relPath: string;
  filePath: string;
  projectRoot: string;
  fileNodeId: string;
  nodes: GraphNode[];
  edges: import('./graphTypes').GraphEdge[];
  content: string;
}

export interface ParsedName {
  name: string;
  exported: boolean;
}

// ─── Line iteration ───────────────────────────────────────────────────────────

export function forEachLine(
  content: string,
  visitor: (line: string, lineNumber: number, lineStart: number) => void,
): void {
  let lineStart = 0;
  let lineNumber = 1;
  for (let index = 0; index <= content.length; index += 1) {
    if (index === content.length || content.charAt(index) === '\n') {
      visitor(content.slice(lineStart, index), lineNumber, lineStart);
      lineStart = index + 1;
      lineNumber += 1;
    }
  }
}

// ─── String utilities ─────────────────────────────────────────────────────────

export function skipWhitespace(text: string, startIndex: number): number {
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

export function readIdentifier(text: string, startIndex: number): string | null {
  const index = skipWhitespace(text, startIndex);
  if (index >= text.length || !isIdentifierStartChar(text.charAt(index))) return null;
  let end = index + 1;
  while (end < text.length && isIdentifierChar(text.charAt(end))) end += 1;
  return text.slice(index, end);
}

export function collapseWhitespace(text: string): string {
  let result = '';
  let pendingSpace = false;
  for (let index = 0; index < text.length; index += 1) {
    const ch = text.charAt(index);
    if (ch.charCodeAt(0) <= 32) {
      pendingSpace = result.length > 0;
      continue;
    }
    if (pendingSpace) {
      result += ' ';
      pendingSpace = false;
    }
    result += ch;
  }
  return result.trim();
}

export function stripExportPrefix(line: string): { body: string; exported: boolean } {
  const trimmed = line.trimStart();
  return trimmed.startsWith('export ')
    ? { body: trimmed.slice('export '.length).trimStart(), exported: true }
    : { body: trimmed, exported: false };
}

// ─── Declaration parsers ──────────────────────────────────────────────────────

export function parseKeywordDeclaration(
  line: string,
  keyword: string,
  allowAsync = false,
): ParsedName | null {
  const { body, exported } = stripExportPrefix(line);
  let normalized = collapseWhitespace(body);
  if (allowAsync && normalized.startsWith('async ')) normalized = normalized.slice('async '.length);
  if (!normalized.startsWith(keyword + ' ')) return null;
  const name = readIdentifier(normalized, keyword.length + 1);
  return name ? { name, exported } : null;
}

function parseVariableDeclarationName(text: string): { name: string; cursor: number } | null {
  for (const keyword of ['const ', 'let ', 'var '] as const) {
    if (!text.startsWith(keyword)) continue;
    const name = readIdentifier(text, keyword.length);
    if (!name) return null;
    return { name, cursor: skipWhitespace(text, keyword.length + name.length) };
  }
  return null;
}

function skipTypeAnnotation(text: string, cursor: number): number {
  if (text.charAt(cursor) !== ':') return cursor;
  let index = cursor + 1;
  while (index < text.length && text.charAt(index) !== '=') index += 1;
  return index;
}

function hasArrowFunctionStart(text: string, cursor: number): boolean {
  const afterEquals = skipWhitespace(text, cursor);
  const afterAsync = text.startsWith('async ', afterEquals)
    ? skipWhitespace(text, afterEquals + 'async '.length)
    : afterEquals;
  return text.charAt(afterAsync) === '(';
}

export function parseArrowFunctionName(line: string): ParsedName | null {
  const { body, exported } = stripExportPrefix(line);
  const normalized = collapseWhitespace(body);
  const variable = parseVariableDeclarationName(normalized);
  if (!variable) return null;
  const cursor = skipTypeAnnotation(normalized, variable.cursor);
  if (normalized.charAt(cursor) !== '=') return null;
  return hasArrowFunctionStart(normalized, cursor + 1) ? { name: variable.name, exported } : null;
}

export function parseFunctionName(line: string): ParsedName | null {
  return parseKeywordDeclaration(line, 'function', true);
}

export function parseInterfaceName(line: string): ParsedName | null {
  return parseKeywordDeclaration(line, 'interface');
}

export function parseTypeAliasName(line: string): ParsedName | null {
  return parseKeywordDeclaration(line, 'type');
}

// ─── Class header parser ──────────────────────────────────────────────────────

export function parseClassHeader(
  header: string,
): { name: string; extendsName?: string; implementsNames: string[]; exported: boolean } | null {
  const { body, exported } = stripExportPrefix(header);
  const normalized = collapseWhitespace(body);
  let cursor = normalized.startsWith('abstract ') ? 'abstract '.length : 0;
  if (!normalized.startsWith('class ', cursor)) return null;
  cursor += 'class '.length;
  const name = readIdentifier(normalized, cursor);
  if (!name) return null;
  cursor = skipWhitespace(normalized, cursor + name.length);
  let extendsName: string | undefined;
  if (normalized.startsWith('extends ', cursor)) {
    cursor += 'extends '.length;
    extendsName = readIdentifier(normalized, cursor) ?? undefined;
    if (extendsName) cursor = skipWhitespace(normalized, cursor + extendsName.length);
  }
  const implementsIndex = normalized.indexOf('implements ', cursor);
  const implementsNames =
    implementsIndex < 0
      ? []
      : normalized
          .slice(implementsIndex + 'implements '.length)
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean);
  return { name, extendsName, implementsNames, exported };
}

// ─── Import / export parsers ──────────────────────────────────────────────────

export function parseQuotedModuleSpecifier(line: string, prefix: string): string | null {
  const normalized = collapseWhitespace(line.trimStart());
  if (!normalized.startsWith(prefix)) return null;
  const fromIndex = normalized.toLowerCase().lastIndexOf(' from ');
  if (fromIndex < 0) return null;
  const afterFrom = normalized.slice(fromIndex + ' from '.length).trimStart();
  const quote = afterFrom.charAt(0);
  if (quote !== '"' && quote !== "'") return null;
  const end = afterFrom.indexOf(quote, 1);
  return end >= 0 ? afterFrom.slice(1, end) : null;
}

export function parseExportDefaultName(line: string): string | null {
  const normalized = collapseWhitespace(line.trimStart());
  if (!normalized.startsWith('export default ')) return null;
  let body = normalized.slice('export default '.length);
  if (body.startsWith('abstract ')) body = body.slice('abstract '.length);
  if (body.startsWith('class ')) return readIdentifier(body, 'class '.length);
  if (body.startsWith('function ')) return readIdentifier(body, 'function '.length);
  return null;
}

// ─── Method name parser ───────────────────────────────────────────────────────

function stripMethodModifiers(text: string): string {
  let trimmed = text.trimStart();
  let changed = true;
  while (changed) {
    changed = false;
    for (const prefix of METHOD_PREFIXES) {
      if (!trimmed.startsWith(prefix)) continue;
      trimmed = trimmed.slice(prefix.length).trimStart();
      changed = true;
      break;
    }
  }
  return trimmed;
}

export function parseMethodName(line: string): string | null {
  const trimmed = stripMethodModifiers(line);
  const name = readIdentifier(trimmed, 0);
  if (!name || SKIP_METHOD_NAMES.has(name)) return null;
  return trimmed.charAt(skipWhitespace(trimmed, name.length)) === '(' ? name : null;
}
