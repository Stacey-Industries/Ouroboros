/**
 * graphParserCallGraph.ts — Call graph edge extraction from tree-sitter AST.
 * Extracts function call relationships from TS/JS code.
 */

import type TreeSitterModule from 'web-tree-sitter';

import { BUILTIN_CALLEES, makeNodeId } from './graphParserShared';
import type { GraphEdge, GraphNode } from './graphTypes';

// ─── Call Edge Context ───────────────────────────────────────────────────────

interface CallEdgeContext {
  localSymbols: Map<string, string>;
  seenPairs: Set<string>;
  edges: GraphEdge[];
}

// ─── Public API ──────────────────────────────────────────────────────────────

export function extractCallEdges(
  tree: TreeSitterModule.Tree,
  symbolNodes: GraphNode[],
  relPath: string,
): GraphEdge[] {
  const callCtx: CallEdgeContext = {
    localSymbols: buildLocalSymbolMap(symbolNodes, relPath),
    seenPairs: new Set<string>(),
    edges: [],
  };
  const functionBodies = collectFunctionBodies(tree.rootNode, relPath);

  for (const [sourceId, body] of functionBodies) {
    extractCallsFromBody(body, sourceId, callCtx);
  }

  return callCtx.edges;
}

// ─── Symbol Map ──────────────────────────────────────────────────────────────

function buildLocalSymbolMap(symbolNodes: GraphNode[], relPath: string): Map<string, string> {
  const localSymbols = new Map<string, string>();
  for (const node of symbolNodes) {
    if (node.type !== 'file' && node.filePath === relPath) {
      if (!localSymbols.has(node.name)) {
        localSymbols.set(node.name, node.id);
      }
    }
  }
  return localSymbols;
}

// ─── Function Body Collection ────────────────────────────────────────────────

function collectFunctionBodies(
  rootNode: TreeSitterModule.Node,
  relPath: string,
): Map<string, TreeSitterModule.Node> {
  const functionBodies = new Map<string, TreeSitterModule.Node>();
  collectBodiesRecursive(rootNode, relPath, functionBodies);
  return functionBodies;
}

function collectBodiesRecursive(
  node: TreeSitterModule.Node,
  relPath: string,
  functionBodies: Map<string, TreeSitterModule.Node>,
): void {
  collectNamedFunctionBody(node, relPath, functionBodies);
  collectArrowFunctionBody(node, relPath, functionBodies);

  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child) collectBodiesRecursive(child, relPath, functionBodies);
  }
}

const NAMED_FUNC_TYPES = new Set([
  'function_declaration',
  'generator_function_declaration',
  'method_definition',
]);

function collectNamedFunctionBody(
  node: TreeSitterModule.Node,
  relPath: string,
  functionBodies: Map<string, TreeSitterModule.Node>,
): void {
  if (!NAMED_FUNC_TYPES.has(node.type)) return;
  const nameNode = node.childForFieldName('name');
  const body = node.childForFieldName('body');
  if (!nameNode || !body) return;
  const line = node.startPosition.row + 1;
  const nodeId = makeNodeId(relPath, nameNode.text, 'function', line);
  functionBodies.set(nodeId, body);
}

const ARROW_FUNC_TYPES = new Set(['arrow_function', 'function_expression', 'function']);

function collectArrowFunctionBody(
  node: TreeSitterModule.Node,
  relPath: string,
  functionBodies: Map<string, TreeSitterModule.Node>,
): void {
  if (node.type !== 'variable_declarator') return;
  const nameNode = node.childForFieldName('name');
  const valueNode = node.childForFieldName('value');
  if (!nameNode || !valueNode) return;
  if (!ARROW_FUNC_TYPES.has(valueNode.type)) return;
  const body = valueNode.childForFieldName('body');
  if (!body) return;
  const parentDecl = node.parent;
  const line = parentDecl ? parentDecl.startPosition.row + 1 : node.startPosition.row + 1;
  const nodeId = makeNodeId(relPath, nameNode.text, 'function', line);
  functionBodies.set(nodeId, body);
}

// ─── Call Extraction ─────────────────────────────────────────────────────────

function extractCallsFromBody(
  node: TreeSitterModule.Node,
  sourceId: string,
  callCtx: CallEdgeContext,
): void {
  if (node.type === 'call_expression') {
    processCallExpression(node, sourceId, callCtx);
  }
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child) extractCallsFromBody(child, sourceId, callCtx);
  }
}

function processCallExpression(
  node: TreeSitterModule.Node,
  sourceId: string,
  callCtx: CallEdgeContext,
): void {
  const funcNode = node.childForFieldName('function');
  if (!funcNode) return;
  const calleeName = resolveCalleeName(funcNode);
  if (!calleeName || BUILTIN_CALLEES.has(calleeName)) return;

  const targetId = callCtx.localSymbols.get(calleeName) ?? `__unresolved::${calleeName}::function`;
  const pairKey = `${sourceId}|${targetId}`;
  if (!callCtx.seenPairs.has(pairKey)) {
    callCtx.seenPairs.add(pairKey);
    callCtx.edges.push({ source: sourceId, target: targetId, type: 'calls' });
  }
}

function resolveCalleeName(funcNode: TreeSitterModule.Node): string | null {
  if (funcNode.type === 'identifier') return funcNode.text;
  if (funcNode.type === 'member_expression') {
    const prop = funcNode.childForFieldName('property');
    const obj = funcNode.childForFieldName('object');
    if (!prop) return null;
    if (obj && BUILTIN_CALLEES.has(obj.text)) return null;
    return prop.text;
  }
  return null;
}
