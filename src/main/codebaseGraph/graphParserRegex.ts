import fs from 'fs/promises';
import path from 'path';

import {
  createFileNode,
  makeNodeId,
  type ParseResult,
  resolveImportPath,
} from './graphParserShared';
import type { GraphEdge, GraphNode } from './graphTypes';

const SKIP_METHOD_NAMES = new Set([
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
const METHOD_PREFIXES = [
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

interface RegexCtx {
  relPath: string;
  filePath: string;
  projectRoot: string;
  fileNodeId: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  content: string;
}
interface ParsedName {
  name: string;
  exported: boolean;
}

export async function parseFileRegex(filePath: string, projectRoot: string): Promise<ParseResult> {
  const relPath = path.relative(projectRoot, filePath).replace(/\\/g, '/');
  const { fileNodeId, fileNode } = createFileNode(relPath);
  const nodes: GraphNode[] = [fileNode];
  const edges: GraphEdge[] = [];
  let content: string;
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    content = await fs.readFile(filePath, 'utf-8');
  } catch {
    return { nodes: [], edges: [] };
  }
  const ctx = { relPath, filePath, projectRoot, fileNodeId, nodes, edges, content };
  extractFunctions(ctx);
  extractClasses(ctx);
  extractClassMethods(ctx);
  extractInterfaces(ctx);
  extractTypeAliases(ctx);
  extractImports(ctx);
  extractExportDefaults(ctx);
  extractReExports(ctx);
  return { nodes, edges };
}

function forEachLine(
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

function collapseWhitespace(text: string): string {
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

function stripExportPrefix(line: string): { body: string; exported: boolean } {
  const trimmed = line.trimStart();
  return trimmed.startsWith('export ')
    ? { body: trimmed.slice('export '.length).trimStart(), exported: true }
    : { body: trimmed, exported: false };
}

function parseKeywordDeclaration(
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

function parseArrowFunctionName(line: string): ParsedName | null {
  const { body, exported } = stripExportPrefix(line);
  const normalized = collapseWhitespace(body);
  const variable = parseVariableDeclarationName(normalized);
  if (!variable) return null;
  const cursor = skipTypeAnnotation(normalized, variable.cursor);
  if (normalized.charAt(cursor) !== '=') return null;
  return hasArrowFunctionStart(normalized, cursor + 1) ? { name: variable.name, exported } : null;
}

function parseFunctionName(line: string): ParsedName | null {
  return parseKeywordDeclaration(line, 'function', true);
}
function parseInterfaceName(line: string): ParsedName | null {
  return parseKeywordDeclaration(line, 'interface');
}
function parseTypeAliasName(line: string): ParsedName | null {
  return parseKeywordDeclaration(line, 'type');
}

function parseClassHeader(
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

function parseQuotedModuleSpecifier(line: string, prefix: string): string | null {
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

function parseExportDefaultName(line: string): string | null {
  const normalized = collapseWhitespace(line.trimStart());
  if (!normalized.startsWith('export default ')) return null;
  let body = normalized.slice('export default '.length);
  if (body.startsWith('abstract ')) body = body.slice('abstract '.length);
  if (body.startsWith('class ')) return readIdentifier(body, 'class '.length);
  if (body.startsWith('function ')) return readIdentifier(body, 'function '.length);
  return null;
}

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

function parseMethodName(line: string): string | null {
  const trimmed = stripMethodModifiers(line);
  const name = readIdentifier(trimmed, 0);
  if (!name || SKIP_METHOD_NAMES.has(name)) return null;
  return trimmed.charAt(skipWhitespace(trimmed, name.length)) === '(' ? name : null;
}

function addNodeIfNew(
  ctx: RegexCtx,
  opts: { name: string; type: GraphNode['type']; line: number; isExported: boolean },
): void {
  const nodeId = makeNodeId(ctx.relPath, opts.name, opts.type, opts.line);
  if (ctx.nodes.some((node) => node.id === nodeId)) return;
  ctx.nodes.push({
    id: nodeId,
    type: opts.type,
    name: opts.name,
    filePath: ctx.relPath,
    line: opts.line,
  });
  ctx.edges.push({ source: ctx.fileNodeId, target: nodeId, type: 'contains' });
  if (opts.isExported) ctx.edges.push({ source: ctx.fileNodeId, target: nodeId, type: 'exports' });
}

function addParsedNode(
  ctx: RegexCtx,
  parsed: ParsedName,
  type: GraphNode['type'],
  lineNumber: number,
): void {
  addNodeIfNew(ctx, { name: parsed.name, type, line: lineNumber, isExported: parsed.exported });
}

function extractParsedNodes(
  ctx: RegexCtx,
  type: GraphNode['type'],
  parser: (line: string) => ParsedName | null,
): void {
  forEachLine(ctx.content, (line, lineNumber) => {
    const parsed = parser(line);
    if (parsed) addParsedNode(ctx, parsed, type, lineNumber);
  });
}

function visitClassHeaders(
  ctx: RegexCtx,
  visitor: (
    parsed: NonNullable<ReturnType<typeof parseClassHeader>>,
    lineNumber: number,
    braceIndex: number,
  ) => void,
): void {
  forEachLine(ctx.content, (line, lineNumber, lineStart) => {
    const braceIndex = ctx.content.indexOf('{', lineStart);
    if (braceIndex < 0) return;
    const parsed = parseClassHeader(ctx.content.slice(lineStart, braceIndex));
    if (parsed) visitor(parsed, lineNumber, braceIndex);
  });
}

function extractFunctions(ctx: RegexCtx): void {
  extractParsedNodes(
    ctx,
    'function',
    (line) => parseFunctionName(line) ?? parseArrowFunctionName(line),
  );
}

function extractClasses(ctx: RegexCtx): void {
  visitClassHeaders(ctx, (parsed, lineNumber) => {
    const nodeId = makeNodeId(ctx.relPath, parsed.name, 'class', lineNumber);
    ctx.nodes.push({
      id: nodeId,
      type: 'class',
      name: parsed.name,
      filePath: ctx.relPath,
      line: lineNumber,
    });
    ctx.edges.push({ source: ctx.fileNodeId, target: nodeId, type: 'contains' });
    if (parsed.exported)
      ctx.edges.push({ source: ctx.fileNodeId, target: nodeId, type: 'exports' });
    if (parsed.extendsName)
      ctx.edges.push({
        source: nodeId,
        target: `__unresolved::${parsed.extendsName}::class`,
        type: 'extends',
      });
    for (const impl of parsed.implementsNames)
      ctx.edges.push({
        source: nodeId,
        target: `__unresolved::${impl}::interface`,
        type: 'implements',
      });
  });
}

function extractClassBody(content: string, startPos: number): string {
  let depth = 1;
  let pos = startPos;
  while (pos < content.length && depth > 0) {
    const ch = content.charAt(pos);
    if (ch === '{') depth += 1;
    else if (ch === '}') depth -= 1;
    pos += 1;
  }
  return content.slice(startPos, pos);
}

function extractMethodsFromBody(ctx: RegexCtx, classBody: string, classLine: number): void {
  forEachLine(classBody, (line, lineNumber) => {
    const methodName = parseMethodName(line);
    if (!methodName) return;
    addNodeIfNew(ctx, {
      name: methodName,
      type: 'function',
      line: classLine + lineNumber - 1,
      isExported: false,
    });
  });
}

function extractClassMethods(ctx: RegexCtx): void {
  visitClassHeaders(ctx, (_parsed, lineNumber, braceIndex) =>
    extractMethodsFromBody(ctx, extractClassBody(ctx.content, braceIndex + 1), lineNumber),
  );
}
function extractInterfaces(ctx: RegexCtx): void {
  extractParsedNodes(ctx, 'interface', parseInterfaceName);
}
function extractTypeAliases(ctx: RegexCtx): void {
  extractParsedNodes(ctx, 'type_alias', parseTypeAliasName);
}

function extractImports(ctx: RegexCtx): void {
  forEachLine(ctx.content, (line) => {
    const importSpec =
      parseQuotedModuleSpecifier(line, 'import ') ?? parseQuotedModuleSpecifier(line, 'export ');
    if (!importSpec) return;
    const resolved = resolveImportPath(importSpec, ctx.filePath, ctx.projectRoot);
    if (resolved)
      ctx.edges.push({ source: ctx.fileNodeId, target: `__file::${resolved}`, type: 'imports' });
  });
}

function extractExportDefaults(ctx: RegexCtx): void {
  forEachLine(ctx.content, (line) => {
    const name = parseExportDefaultName(line);
    if (!name) return;
    const existing = ctx.nodes.find((node) => node.name === name && node.filePath === ctx.relPath);
    if (!existing) return;
    const hasExportEdge = ctx.edges.some(
      (edge) =>
        edge.source === ctx.fileNodeId && edge.target === existing.id && edge.type === 'exports',
    );
    if (!hasExportEdge)
      ctx.edges.push({ source: ctx.fileNodeId, target: existing.id, type: 'exports' });
  });
}

function extractReExports(ctx: RegexCtx): void {
  forEachLine(ctx.content, (line) => {
    const importSpec = parseQuotedModuleSpecifier(line, 'export {');
    if (!importSpec) return;
    const resolved = resolveImportPath(importSpec, ctx.filePath, ctx.projectRoot);
    if (resolved)
      ctx.edges.push({ source: ctx.fileNodeId, target: `__file::${resolved}`, type: 'imports' });
  });
}
