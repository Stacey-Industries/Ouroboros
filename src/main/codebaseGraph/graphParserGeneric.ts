/**
 * graphParserGeneric.ts — Generic multi-language symbol extraction via tree-sitter.
 * Supports Python, Go, Rust, Java, C/C++ with pluggable configs.
 */

import path from 'path';
import type TreeSitterModule from 'web-tree-sitter';

import {
  findDescendantsOfType,
  makeNodeId,
  type ParseResult,
  resolveImportPath,
} from './graphParserShared';
import type { GraphEdge, GraphNode } from './graphTypes';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface LanguageExtractorConfig {
  functionTypes: Set<string>;
  classTypes: Set<string>;
  interfaceTypes: Set<string>;
  importTypes: Set<string>;
  getNameField: (node: TreeSitterModule.Node) => string | null;
  getImportSource: (node: TreeSitterModule.Node) => string | null;
}

// ─── Language Configs ────────────────────────────────────────────────────────

const pythonConfig: LanguageExtractorConfig = {
  functionTypes: new Set(['function_definition']),
  classTypes: new Set(['class_definition']),
  interfaceTypes: new Set(),
  importTypes: new Set(['import_statement', 'import_from_statement']),
  getNameField: (node) => node.childForFieldName('name')?.text ?? null,
  getImportSource: (node) => {
    const mod = node.childForFieldName('module_name') ?? node.childForFieldName('module');
    if (mod) return mod.text;
    const dottedName = findDescendantsOfType(node, 'dotted_name')[0];
    return dottedName?.text ?? null;
  },
};

const goConfig: LanguageExtractorConfig = {
  functionTypes: new Set(['function_declaration', 'method_declaration']),
  classTypes: new Set(['type_declaration']),
  interfaceTypes: new Set(['type_declaration']),
  importTypes: new Set(['import_declaration']),
  getNameField: (node) => node.childForFieldName('name')?.text ?? null,
  getImportSource: (node) => {
    const spec =
      findDescendantsOfType(node, 'import_spec')[0] ??
      findDescendantsOfType(node, 'interpreted_string_literal')[0];
    return spec?.text?.replace(/"/g, '') ?? null;
  },
};

const rustConfig: LanguageExtractorConfig = {
  functionTypes: new Set(['function_item']),
  classTypes: new Set(['struct_item', 'enum_item']),
  interfaceTypes: new Set(['trait_item']),
  importTypes: new Set(['use_declaration']),
  getNameField: (node) => node.childForFieldName('name')?.text ?? null,
  getImportSource: (node) => {
    const arg = node.childForFieldName('argument');
    return arg?.text ?? null;
  },
};

const javaConfig: LanguageExtractorConfig = {
  functionTypes: new Set(['method_declaration', 'constructor_declaration']),
  classTypes: new Set(['class_declaration', 'enum_declaration']),
  interfaceTypes: new Set(['interface_declaration', 'annotation_type_declaration']),
  importTypes: new Set(['import_declaration']),
  getNameField: (node) => node.childForFieldName('name')?.text ?? null,
  getImportSource: (node) => {
    const children = node.namedChildren;
    return children.length > 0 ? (children[children.length - 1]?.text ?? null) : null;
  },
};

const cConfig: LanguageExtractorConfig = {
  functionTypes: new Set(['function_definition']),
  classTypes: new Set(['struct_specifier', 'enum_specifier', 'union_specifier']),
  interfaceTypes: new Set(),
  importTypes: new Set(['preproc_include']),
  getNameField: (node) => {
    const decl = node.childForFieldName('declarator');
    if (decl) {
      const name = decl.childForFieldName('declarator') ?? decl;
      return name.type === 'identifier'
        ? name.text
        : (decl.childForFieldName('name')?.text ?? name.text);
    }
    return node.childForFieldName('name')?.text ?? null;
  },
  getImportSource: (node) => {
    const p = node.childForFieldName('path');
    return p?.text?.replace(/[<>"]/g, '') ?? null;
  },
};

const cppConfig: LanguageExtractorConfig = {
  ...cConfig,
  classTypes: new Set(['struct_specifier', 'class_specifier', 'enum_specifier', 'union_specifier']),
  interfaceTypes: new Set(),
};

export const LANGUAGE_CONFIGS: Record<string, LanguageExtractorConfig> = {
  'tree-sitter-python': pythonConfig,
  'tree-sitter-go': goConfig,
  'tree-sitter-rust': rustConfig,
  'tree-sitter-java': javaConfig,
  'tree-sitter-c': cConfig,
  'tree-sitter-cpp': cppConfig,
};

// ─── Generic Symbol Extraction ───────────────────────────────────────────────

interface GenericExtractorOpts {
  tree: TreeSitterModule.Tree;
  relPath: string;
  filePath: string;
  projectRoot: string;
  config: LanguageExtractorConfig;
}

interface GenericWalkContext {
  config: LanguageExtractorConfig;
  fileNodeId: string;
  relPath: string;
  filePath: string;
  projectRoot: string;
  seenIds: Set<string>;
  nodes: GraphNode[];
  edges: GraphEdge[];
}

interface SymbolAddOpts {
  name: string;
  type: GraphNode['type'];
  line: number;
  endLine: number;
}

function addGenericSymbol(ctx: GenericWalkContext, opts: SymbolAddOpts): void {
  const nodeId = makeNodeId(ctx.relPath, opts.name, opts.type, opts.line);
  if (ctx.seenIds.has(nodeId)) return;
  ctx.seenIds.add(nodeId);
  ctx.nodes.push({
    id: nodeId,
    type: opts.type,
    name: opts.name,
    filePath: ctx.relPath,
    line: opts.line,
    endLine: opts.endLine,
  });
  ctx.edges.push({ source: ctx.fileNodeId, target: nodeId, type: 'contains' });
}

function walkGenericNode(node: TreeSitterModule.Node, ctx: GenericWalkContext): void {
  const line = node.startPosition.row + 1;
  const endLine = node.endPosition.row + 1;

  handleGenericSymbol(node, ctx, line, endLine);
  handleGenericImport(node, ctx);

  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child) walkGenericNode(child, ctx);
  }
}

function handleGenericSymbol(
  node: TreeSitterModule.Node,
  ctx: GenericWalkContext,
  line: number,
  endLine: number,
): void {
  const type = node.type;
  if (ctx.config.functionTypes.has(type)) {
    const name = ctx.config.getNameField(node);
    if (name) addGenericSymbol(ctx, { name, type: 'function', line, endLine });
  }
  if (ctx.config.classTypes.has(type)) {
    const name = ctx.config.getNameField(node);
    if (name) addGenericSymbol(ctx, { name, type: 'class', line, endLine });
  }
  if (ctx.config.interfaceTypes.has(type)) {
    const name = ctx.config.getNameField(node);
    if (name) addGenericSymbol(ctx, { name, type: 'interface', line, endLine });
  }
}

function handleGenericImport(node: TreeSitterModule.Node, ctx: GenericWalkContext): void {
  if (!ctx.config.importTypes.has(node.type)) return;
  const source = ctx.config.getImportSource(node);
  if (!source) return;
  const resolved = resolveImportPath(source, ctx.filePath, ctx.projectRoot);
  if (resolved) {
    ctx.edges.push({ source: ctx.fileNodeId, target: `__file::${resolved}`, type: 'imports' });
  }
}

export function extractSymbolsGeneric(opts: GenericExtractorOpts): ParseResult {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const fileNodeId = makeNodeId(opts.relPath, path.basename(opts.relPath), 'file', 0);
  nodes.push({
    id: fileNodeId,
    type: 'file',
    name: path.basename(opts.relPath),
    filePath: opts.relPath,
    line: 0,
  });

  const ctx: GenericWalkContext = {
    config: opts.config,
    fileNodeId,
    relPath: opts.relPath,
    filePath: opts.filePath,
    projectRoot: opts.projectRoot,
    seenIds: new Set<string>(),
    nodes,
    edges,
  };

  walkGenericNode(opts.tree.rootNode, ctx);
  return { nodes, edges };
}
