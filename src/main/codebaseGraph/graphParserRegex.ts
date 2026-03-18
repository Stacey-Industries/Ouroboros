/**
 * graphParserRegex.ts — Regex fallback parser for symbol extraction.
 * Used when tree-sitter is not available for a file type.
 */

import fs from 'fs/promises';
import path from 'path';

import {
  createFileNode,
  makeNodeId,
  type ParseResult,
  resolveImportPath,
} from './graphParserShared';
import type { GraphEdge, GraphNode } from './graphTypes';

// ─── Regex Patterns ──────────────────────────────────────────────────────────
// eslint-disable-next-line security/detect-unsafe-regex
const FUNC_DECL_RE = /^(?:export\s+)?(?:async\s+)?function\s+(\w+)/gm;
// eslint-disable-next-line security/detect-unsafe-regex
const ARROW_FUNC_RE =
  /^(?:export\s+)?(?:const|let|var)\s+(\w+)\s*(?::\s*[^=]+?)?\s*=\s*(?:async\s+)?\(/gm;
// eslint-disable-next-line security/detect-unsafe-regex
const ARROW_FUNC_TYPED_RE =
  /^(?:export\s+)?(?:const|let|var)\s+(\w+)\s*:\s*\S+\s*=\s*(?:async\s+)?\(/gm;
// eslint-disable-next-line security/detect-unsafe-regex
const CLASS_RE =
  /^(?:export\s+)?(?:abstract\s+)?class\s+(\w+)(?:\s+extends\s+(\w+))?(?:\s+implements\s+([\w,\s]+))?/gm;
// eslint-disable-next-line security/detect-unsafe-regex
const CLASS_BLOCK_RE = /^(?:export\s+)?(?:abstract\s+)?class\s+\w+[^{]*\{/gm;
// eslint-disable-next-line security/detect-unsafe-regex
const METHOD_BODY_RE =
  /^\s+(?:(?:public|private|protected|static|async|readonly|override|get|set)\s+)*(\w+)\s*\(/gm;
// eslint-disable-next-line security/detect-unsafe-regex
const INTERFACE_RE = /^(?:export\s+)?interface\s+(\w+)/gm;
// eslint-disable-next-line security/detect-unsafe-regex
const TYPE_RE = /^(?:export\s+)?type\s+(\w+)\s*(?:<[^>]*>)?\s*=/gm;
// eslint-disable-next-line security/detect-unsafe-regex
const IMPORT_RE =
  /^import\s+(?:type\s+)?(?:\{[^}]+\}|(\w+)|\*\s+as\s+(\w+)).*from\s+['"]([^'"]+)['"]/gm;
const EXPORT_DEFAULT_RE = /^export\s+default\s+(?:class|function|abstract\s+class)\s+(\w+)/gm;
const RE_EXPORT_RE = /^export\s+\{[^}]*\}\s*from\s+['"]([^'"]+)['"]/gm;

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

// ─── Public API ──────────────────────────────────────────────────────────────

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
  extractArrowFunctions(ctx);
  extractArrowFunctionsTyped(ctx);
  extractClasses(ctx);
  extractClassMethods(ctx);
  extractInterfaces(ctx);
  extractTypeAliases(ctx);
  extractImports(ctx);
  extractExportDefaults(ctx);
  extractReExports(ctx);

  return { nodes, edges };
}

// ─── Internal Types ──────────────────────────────────────────────────────────

interface RegexCtx {
  relPath: string;
  filePath: string;
  projectRoot: string;
  fileNodeId: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  content: string;
}

// ─── Extraction Helpers ──────────────────────────────────────────────────────

function getLine(content: string, index: number): number {
  return content.substring(0, index).split('\n').length;
}

function addNodeIfNew(
  ctx: RegexCtx,
  opts: { name: string; type: GraphNode['type']; line: number; isExported: boolean },
): void {
  const nodeId = makeNodeId(ctx.relPath, opts.name, opts.type, opts.line);
  if (ctx.nodes.some((n) => n.id === nodeId)) return;
  ctx.nodes.push({
    id: nodeId,
    type: opts.type,
    name: opts.name,
    filePath: ctx.relPath,
    line: opts.line,
  });
  ctx.edges.push({ source: ctx.fileNodeId, target: nodeId, type: 'contains' });
  if (opts.isExported) {
    ctx.edges.push({ source: ctx.fileNodeId, target: nodeId, type: 'exports' });
  }
}

function extractFunctions(ctx: RegexCtx): void {
  FUNC_DECL_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = FUNC_DECL_RE.exec(ctx.content)) !== null) {
    const name = match[1];
    const line = getLine(ctx.content, match.index);
    const nodeId = makeNodeId(ctx.relPath, name, 'function', line);
    ctx.nodes.push({ id: nodeId, type: 'function', name, filePath: ctx.relPath, line });
    ctx.edges.push({ source: ctx.fileNodeId, target: nodeId, type: 'contains' });
    if (match[0].startsWith('export')) {
      ctx.edges.push({ source: ctx.fileNodeId, target: nodeId, type: 'exports' });
    }
  }
}

function extractArrowFunctions(ctx: RegexCtx): void {
  ARROW_FUNC_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = ARROW_FUNC_RE.exec(ctx.content)) !== null) {
    addNodeIfNew(ctx, {
      name: match[1],
      type: 'function',
      line: getLine(ctx.content, match.index),
      isExported: match[0].startsWith('export'),
    });
  }
}

function extractArrowFunctionsTyped(ctx: RegexCtx): void {
  ARROW_FUNC_TYPED_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = ARROW_FUNC_TYPED_RE.exec(ctx.content)) !== null) {
    addNodeIfNew(ctx, {
      name: match[1],
      type: 'function',
      line: getLine(ctx.content, match.index),
      isExported: match[0].startsWith('export'),
    });
  }
}

function extractClasses(ctx: RegexCtx): void {
  CLASS_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = CLASS_RE.exec(ctx.content)) !== null) {
    const name = match[1];
    const extendsName = match[2];
    const implementsRaw = match[3];
    const line = getLine(ctx.content, match.index);
    const nodeId = makeNodeId(ctx.relPath, name, 'class', line);
    ctx.nodes.push({ id: nodeId, type: 'class', name, filePath: ctx.relPath, line });
    ctx.edges.push({ source: ctx.fileNodeId, target: nodeId, type: 'contains' });
    if (match[0].startsWith('export')) {
      ctx.edges.push({ source: ctx.fileNodeId, target: nodeId, type: 'exports' });
    }
    if (extendsName) {
      ctx.edges.push({
        source: nodeId,
        target: `__unresolved::${extendsName}::class`,
        type: 'extends',
      });
    }
    if (implementsRaw) {
      for (const impl of implementsRaw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)) {
        ctx.edges.push({
          source: nodeId,
          target: `__unresolved::${impl}::interface`,
          type: 'implements',
        });
      }
    }
  }
}

function extractClassMethods(ctx: RegexCtx): void {
  CLASS_BLOCK_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = CLASS_BLOCK_RE.exec(ctx.content)) !== null) {
    const classStart = match.index + match[0].length;
    const classLine = getLine(ctx.content, match.index);
    const classBody = extractClassBody(ctx.content, classStart);
    extractMethodsFromBody(ctx, classBody, classLine);
  }
}

function extractClassBody(content: string, startPos: number): string {
  let depth = 1;
  let pos = startPos;
  while (pos < content.length && depth > 0) {
    const ch = content.charAt(pos);
    if (ch === '{') depth++;
    else if (ch === '}') depth--;
    pos++;
  }
  return content.substring(startPos, pos);
}

function extractMethodsFromBody(ctx: RegexCtx, classBody: string, classLine: number): void {
  METHOD_BODY_RE.lastIndex = 0;
  let methodMatch: RegExpExecArray | null;
  while ((methodMatch = METHOD_BODY_RE.exec(classBody)) !== null) {
    const methodName = methodMatch[1];
    if (SKIP_METHOD_NAMES.has(methodName)) continue;
    const methodLine = classLine + classBody.substring(0, methodMatch.index).split('\n').length - 1;
    addNodeIfNew(ctx, { name: methodName, type: 'function', line: methodLine, isExported: false });
  }
}

function extractInterfaces(ctx: RegexCtx): void {
  INTERFACE_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = INTERFACE_RE.exec(ctx.content)) !== null) {
    const name = match[1];
    const line = getLine(ctx.content, match.index);
    const nodeId = makeNodeId(ctx.relPath, name, 'interface', line);
    ctx.nodes.push({ id: nodeId, type: 'interface', name, filePath: ctx.relPath, line });
    ctx.edges.push({ source: ctx.fileNodeId, target: nodeId, type: 'contains' });
    if (match[0].startsWith('export')) {
      ctx.edges.push({ source: ctx.fileNodeId, target: nodeId, type: 'exports' });
    }
  }
}

function extractTypeAliases(ctx: RegexCtx): void {
  TYPE_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = TYPE_RE.exec(ctx.content)) !== null) {
    const name = match[1];
    const line = getLine(ctx.content, match.index);
    const nodeId = makeNodeId(ctx.relPath, name, 'type_alias', line);
    ctx.nodes.push({ id: nodeId, type: 'type_alias', name, filePath: ctx.relPath, line });
    ctx.edges.push({ source: ctx.fileNodeId, target: nodeId, type: 'contains' });
    if (match[0].startsWith('export')) {
      ctx.edges.push({ source: ctx.fileNodeId, target: nodeId, type: 'exports' });
    }
  }
}

function extractImports(ctx: RegexCtx): void {
  IMPORT_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = IMPORT_RE.exec(ctx.content)) !== null) {
    const importSpec = match[3];
    const resolved = resolveImportPath(importSpec, ctx.filePath, ctx.projectRoot);
    if (resolved) {
      ctx.edges.push({ source: ctx.fileNodeId, target: `__file::${resolved}`, type: 'imports' });
    }
  }
}

function extractExportDefaults(ctx: RegexCtx): void {
  EXPORT_DEFAULT_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = EXPORT_DEFAULT_RE.exec(ctx.content)) !== null) {
    const name = match[1];
    const existing = ctx.nodes.find((n) => n.name === name && n.filePath === ctx.relPath);
    if (!existing) continue;
    const hasExportEdge = ctx.edges.some(
      (e) => e.source === ctx.fileNodeId && e.target === existing.id && e.type === 'exports',
    );
    if (!hasExportEdge) {
      ctx.edges.push({ source: ctx.fileNodeId, target: existing.id, type: 'exports' });
    }
  }
}

function extractReExports(ctx: RegexCtx): void {
  RE_EXPORT_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = RE_EXPORT_RE.exec(ctx.content)) !== null) {
    const importSpec = match[1];
    const resolved = resolveImportPath(importSpec, ctx.filePath, ctx.projectRoot);
    if (resolved) {
      ctx.edges.push({ source: ctx.fileNodeId, target: `__file::${resolved}`, type: 'imports' });
    }
  }
}
