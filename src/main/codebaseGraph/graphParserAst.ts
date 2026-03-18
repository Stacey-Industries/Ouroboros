/**
 * graphParserAst.ts — Tree-sitter AST extraction for TS/JS.
 * Handles detailed symbol extraction and call graph edges.
 */

import type TreeSitterModule from 'web-tree-sitter';

import {
  addSymbolToContext,
  createFileNode,
  makeNodeId,
  type ParseResult,
  resolveImportPath,
  type SymbolExtractionContext,
  TS_CLASS_TYPES,
  TS_FUNCTION_TYPES,
} from './graphParserShared';
import type { GraphEdge, GraphNode } from './graphTypes';

// ─── TS/JS Symbol Extraction ─────────────────────────────────────────────────

interface ExtractSymbolsOpts {
  tree: TreeSitterModule.Tree;
  relPath: string;
  filePath: string;
  projectRoot: string;
}

export function extractSymbolsFromTree(opts: ExtractSymbolsOpts): ParseResult {
  const { tree, relPath, filePath, projectRoot } = opts;
  const { fileNodeId, fileNode } = createFileNode(relPath);
  const nodes: GraphNode[] = [fileNode];
  const edges: GraphEdge[] = [];

  const ctx: SymbolExtractionContext = {
    relPath,
    filePath,
    projectRoot,
    fileNodeId,
    nodes,
    edges,
    seenIds: new Set<string>(),
  };

  for (let i = 0; i < tree.rootNode.childCount; i++) {
    const child = tree.rootNode.child(i);
    if (child) walkTopLevelNode(child, ctx);
  }

  return { nodes, edges };
}

// ─── Top-Level Node Walk ─────────────────────────────────────────────────────

function walkTopLevelNode(node: TreeSitterModule.Node, ctx: SymbolExtractionContext): void {
  const type = node.type;

  if (type === 'export_statement') {
    handleExportStatement(node, ctx);
    return;
  }

  if (type === 'import_statement') {
    handleImportStatement(node, ctx);
    return;
  }

  handleDeclaration(node, false, ctx);

  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child) walkTopLevelNode(child, ctx);
  }
}

// ─── Export Statement ────────────────────────────────────────────────────────

function handleExportStatement(node: TreeSitterModule.Node, ctx: SymbolExtractionContext): void {
  const declaration = node.childForFieldName('declaration');
  if (declaration) {
    handleDeclaration(declaration, true, ctx);
    return;
  }

  handleExportFrom(node, ctx);
  handleExportDefault(node, ctx);
}

function handleExportFrom(node: TreeSitterModule.Node, ctx: SymbolExtractionContext): void {
  const source = node.childForFieldName('source');
  if (!source) return;
  const importSpec = source.text.replace(/['"]/g, '');
  const resolved = resolveImportPath(importSpec, ctx.filePath, ctx.projectRoot);
  if (resolved) {
    ctx.edges.push({ source: ctx.fileNodeId, target: `__file::${resolved}`, type: 'imports' });
  }
}

function handleExportDefault(node: TreeSitterModule.Node, ctx: SymbolExtractionContext): void {
  const defaultExpr = node.namedChildren.find((c) => c.type === 'identifier');
  if (!defaultExpr) return;
  const existing = ctx.nodes.find((n) => n.name === defaultExpr.text && n.filePath === ctx.relPath);
  if (!existing) return;
  const hasExport = ctx.edges.some(
    (e) => e.source === ctx.fileNodeId && e.target === existing.id && e.type === 'exports',
  );
  if (!hasExport) {
    ctx.edges.push({ source: ctx.fileNodeId, target: existing.id, type: 'exports' });
  }
}

// ─── Import Statement ────────────────────────────────────────────────────────

function handleImportStatement(node: TreeSitterModule.Node, ctx: SymbolExtractionContext): void {
  const source = node.childForFieldName('source');
  if (!source) return;
  const importSpec = source.text.replace(/['"]/g, '');
  const resolved = resolveImportPath(importSpec, ctx.filePath, ctx.projectRoot);
  if (resolved) {
    ctx.edges.push({ source: ctx.fileNodeId, target: `__file::${resolved}`, type: 'imports' });
  }
}

// ─── Declaration Handling ────────────────────────────────────────────────────

function handleDeclaration(
  node: TreeSitterModule.Node,
  isExported: boolean,
  ctx: SymbolExtractionContext,
): void {
  const type = node.type;
  const pos = { line: node.startPosition.row + 1, endLine: node.endPosition.row + 1 };

  if (TS_FUNCTION_TYPES.has(type)) {
    const nameNode = node.childForFieldName('name');
    if (nameNode)
      addSymbolToContext(ctx, { name: nameNode.text, type: 'function', ...pos, isExported });
    return;
  }
  if (type === 'lexical_declaration' || type === 'variable_declaration') {
    handleVariableDeclaration(node, pos.line, isExported, ctx);
    return;
  }
  if (TS_CLASS_TYPES.has(type)) {
    handleClassDeclaration(node, isExported, ctx);
    return;
  }
  handleSimpleDeclaration(node, isExported, ctx);
}

function handleVariableDeclaration(
  node: TreeSitterModule.Node,
  line: number,
  isExported: boolean,
  ctx: SymbolExtractionContext,
): void {
  for (let i = 0; i < node.namedChildCount; i++) {
    const declarator = node.namedChild(i);
    if (!declarator || declarator.type !== 'variable_declarator') continue;
    const nameNode = declarator.childForFieldName('name');
    const valueNode = declarator.childForFieldName('value');
    if (!nameNode) continue;

    const endLine = node.endPosition.row + 1;
    const isFn = valueNode && isFunctionExpression(valueNode.type);
    const symType = isFn ? 'function' : 'variable';
    addSymbolToContext(ctx, { name: nameNode.text, type: symType, line, endLine, isExported });
  }
}

function isFunctionExpression(vtype: string): boolean {
  return vtype === 'arrow_function' || vtype === 'function_expression' || vtype === 'function';
}

const SIMPLE_DECL_MAP = new Map<string, GraphNode['type']>([
  ['method_definition', 'function'],
  ['interface_declaration', 'interface'],
  ['type_alias_declaration', 'type_alias'],
  ['enum_declaration', 'type_alias'],
]);

function handleSimpleDeclaration(
  node: TreeSitterModule.Node,
  isExported: boolean,
  ctx: SymbolExtractionContext,
): void {
  const symType = SIMPLE_DECL_MAP.get(node.type);
  if (!symType) return;
  const nameNode = node.childForFieldName('name');
  if (nameNode) {
    const line = node.startPosition.row + 1;
    const endLine = node.endPosition.row + 1;
    addSymbolToContext(ctx, { name: nameNode.text, type: symType, line, endLine, isExported });
  }
}

// ─── Class Declaration ───────────────────────────────────────────────────────

function handleClassDeclaration(
  node: TreeSitterModule.Node,
  isExported: boolean,
  ctx: SymbolExtractionContext,
): void {
  const nameNode = node.childForFieldName('name');
  if (!nameNode) return;

  const line = node.startPosition.row + 1;
  const endLine = node.endPosition.row + 1;
  const classNodeId = addSymbolToContext(ctx, {
    name: nameNode.text,
    type: 'class',
    line,
    endLine,
    isExported,
  });
  addInheritanceEdges(node, classNodeId, ctx);

  const body = node.childForFieldName('body');
  if (body) extractClassMembers(body, ctx);
}

function addInheritanceEdges(
  node: TreeSitterModule.Node,
  classNodeId: string,
  ctx: SymbolExtractionContext,
): void {
  addExtendsEdge(node, classNodeId, ctx);
  addImplementsEdges(node, classNodeId, ctx);
}

function addExtendsEdge(
  node: TreeSitterModule.Node,
  classNodeId: string,
  ctx: SymbolExtractionContext,
): void {
  const heritage =
    node.childForFieldName('superclass') ??
    node.namedChildren.find((c) => c.type === 'extends_clause');
  if (!heritage) return;
  const superName =
    heritage.type === 'extends_clause' ? heritage.namedChildren[0]?.text : heritage.text;
  if (superName) {
    ctx.edges.push({
      source: classNodeId,
      target: `__unresolved::${superName}::class`,
      type: 'extends',
    });
  }
}

function addImplementsEdges(
  node: TreeSitterModule.Node,
  classNodeId: string,
  ctx: SymbolExtractionContext,
): void {
  const implClause = node.namedChildren.find((c) => c.type === 'implements_clause');
  if (!implClause) return;
  for (const child of implClause.namedChildren) {
    if (child.type !== 'type_identifier' && child.type !== 'generic_type') continue;
    const implName =
      child.type === 'generic_type'
        ? (child.childForFieldName('name')?.text ?? child.text)
        : child.text;
    ctx.edges.push({
      source: classNodeId,
      target: `__unresolved::${implName}::interface`,
      type: 'implements',
    });
  }
}

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

function extractClassMembers(body: TreeSitterModule.Node, ctx: SymbolExtractionContext): void {
  for (let i = 0; i < body.namedChildCount; i++) {
    const member = body.namedChild(i);
    if (!member) continue;
    if (!isMemberNode(member.type)) continue;
    const nameNode = member.childForFieldName('name');
    if (!nameNode || SKIP_METHOD_NAMES.has(nameNode.text)) continue;

    const methodLine = member.startPosition.row + 1;
    const methodEndLine = member.endPosition.row + 1;
    const nodeId = makeNodeId(ctx.relPath, nameNode.text, 'function', methodLine);
    if (ctx.seenIds.has(nodeId)) continue;
    ctx.seenIds.add(nodeId);
    ctx.nodes.push({
      id: nodeId,
      type: 'function',
      name: nameNode.text,
      filePath: ctx.relPath,
      line: methodLine,
      endLine: methodEndLine,
    });
    ctx.edges.push({ source: ctx.fileNodeId, target: nodeId, type: 'contains' });
  }
}

function isMemberNode(type: string): boolean {
  return (
    type === 'method_definition' ||
    type === 'public_field_definition' ||
    type === 'property_definition'
  );
}

// Re-export call graph extraction from dedicated module
export { extractCallEdges } from './graphParserCallGraph';
