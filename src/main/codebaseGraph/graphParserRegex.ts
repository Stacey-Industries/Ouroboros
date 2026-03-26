import fs from 'fs/promises';
import path from 'path';

import {
  forEachLine,
  parseArrowFunctionName,
  parseClassHeader,
  type ParsedName,
  parseExportDefaultName,
  parseFunctionName,
  parseInterfaceName,
  parseMethodName,
  parseQuotedModuleSpecifier,
  parseTypeAliasName,
  type RegexCtx,
} from './graphParserRegexExtended';
import {
  createFileNode,
  makeNodeId,
  type ParseResult,
  resolveImportPath,
} from './graphParserShared';
import type { GraphEdge, GraphNode } from './graphTypes';

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
  forEachLine(ctx.content, (_line, lineNumber, lineStart) => {
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
