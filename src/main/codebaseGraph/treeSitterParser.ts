/**
 * treeSitterParser.ts — WASM-based tree-sitter parser for multi-language
 * source code analysis. Extracts definitions, imports, calls, and routes.
 */

import path from 'path'
import Parser from 'web-tree-sitter'

import { getLanguageConfig } from './treeSitterLanguageConfigs'
import { extractSingleDefinition } from './treeSitterParserDefs'
import {
  buildNodeTypeToLabelMap,
  collectDefaultImport,
  collectExportedIdentifiers,
  collectNamedImports,
  collectNamespaceImports,
  detectTypeOnlyImport,
  dispatchNonTsImport,
  extractArrowDeclarator,
  extractCallNodeInfo,
  extractHandlerName,
  extractRouteCandidate,
  extractTopLevelNames,
} from './treeSitterParserSupport'
import type {
  ExtractedCall, ExtractedDefinition, ExtractedImport,
  ExtractedRoute, ImportSpecifier, LanguageConfig, LanguageId, NodeLabel, ParsedFileResult,
} from './treeSitterTypes'

/** Maximum length for extracted signatures before truncation. */
const MAX_SIGNATURE_LENGTH = 200

const TS_JS_LANGUAGES = new Set<LanguageId>(['typescript', 'tsx', 'javascript', 'jsx'])

export class TreeSitterParser {
  private parser: Parser | null = null
  private languages = new Map<LanguageId, Parser.Language>()
  private initialized = false

  // ─── Initialization ──────────────────────────────────────────────────────

  async init(): Promise<void> {
    if (this.initialized) return

    await Parser.init({
      locateFile(scriptName: string) {
        try {
          const webTsPath = require.resolve('web-tree-sitter')
          return path.join(path.dirname(webTsPath), scriptName)
        } catch {
          return scriptName
        }
      },
    })

    this.parser = new Parser()
    this.initialized = true
  }

  // ─── Language loading ─────────────────────────────────────────────────────

  private async loadLanguage(config: LanguageConfig): Promise<Parser.Language> {
    const cached = this.languages.get(config.id)
    if (cached) return cached

    const wasmDir = path.dirname(require.resolve('tree-sitter-wasms/package.json'))
    const wasmPath = path.join(wasmDir, 'out', config.wasmFile)
    const language = await Parser.Language.load(wasmPath)
    this.languages.set(config.id, language)
    return language
  }

  // ─── Main entry point ────────────────────────────────────────────────────

  async parseFile(relativePath: string, source: string): Promise<ParsedFileResult | null> {
    if (!this.parser) throw new Error('TreeSitterParser not initialized — call init() first')

    const ext = path.extname(relativePath).slice(1)
    const config = getLanguageConfig(ext)
    if (!config) return null

    const language = await this.loadLanguage(config)
    this.parser.setLanguage(language)
    const tree = this.parser.parse(source)
    if (!tree) return null

    try {
      const definitions = this.extractDefinitions(tree.rootNode, config)
      const imports = this.extractImports(tree.rootNode, config)
      const calls = this.extractCalls(tree.rootNode, config)
      const routes = this.extractRoutes(tree.rootNode, config)
      const exportedNames = this.extractExportedNames(tree.rootNode, config)

      return {
        filePath: relativePath, language: config.id,
        lineCount: tree.rootNode.endPosition.row + 1,
        definitions, imports, calls, routes, exportedNames,
      }
    } finally {
      tree.delete()
    }
  }

  // ─── Definition extraction ───────────────────────────────────────────────

  private extractDefinitions(
    rootNode: Parser.SyntaxNode,
    config: LanguageConfig,
  ): ExtractedDefinition[] {
    const definitions: ExtractedDefinition[] = []
    const nodeTypeToLabel = buildNodeTypeToLabelMap(config) as Map<string, NodeLabel>

    this.walkTree(rootNode, (node) => {
      const label = nodeTypeToLabel.get(node.type)
      if (!label) return
      const def = extractSingleDefinition(node, label, config)
      if (def) definitions.push(def)
    })

    if (TS_JS_LANGUAGES.has(config.id)) {
      this.extractArrowFunctionExports(rootNode, definitions)
    }

    return definitions
  }

  private extractArrowFunctionExports(
    rootNode: Parser.SyntaxNode,
    definitions: ExtractedDefinition[],
  ): void {
    const existingNames = new Set(definitions.map((d) => d.name))

    this.walkTree(rootNode, (node) => {
      if (node.type !== 'export_statement') return
      const declaration = node.namedChildren.find((c) =>
        c.type === 'lexical_declaration' || c.type === 'variable_declaration'
      )
      if (!declaration) return
      for (const declarator of declaration.namedChildren) {
        extractArrowDeclarator(node, declarator, existingNames, definitions)
      }
    })
  }

  // ─── Import extraction ───────────────────────────────────────────────────

  private extractImports(
    rootNode: Parser.SyntaxNode,
    config: LanguageConfig,
  ): ExtractedImport[] {
    const imports: ExtractedImport[] = []

    this.walkTree(rootNode, (node) => {
      if (!config.importNodes.includes(node.type)) return
      const result = this.dispatchImportExtractor(node, config)
      if (Array.isArray(result)) {
        for (const imp of result) imports.push(imp)
      } else if (result) {
        imports.push(result)
      }
    })

    return imports
  }

  private dispatchImportExtractor(
    node: Parser.SyntaxNode,
    config: LanguageConfig,
  ): ExtractedImport | ExtractedImport[] | null {
    if (TS_JS_LANGUAGES.has(config.id)) return this.extractTsJsImport(node)
    return dispatchNonTsImport(node, config)
  }

  private extractTsJsImport(node: Parser.SyntaxNode): ExtractedImport | null {
    const sourceNode = node.childForFieldName('source')
    if (!sourceNode) return null

    const importSource = sourceNode.text.replace(/['"]/g, '')
    const specifiers: ImportSpecifier[] = []
    const isTypeOnly = detectTypeOnlyImport(node)

    collectNamedImports(node, specifiers)
    collectDefaultImport(node, specifiers)
    collectNamespaceImports(node, specifiers)

    return { source: importSource, specifiers, isTypeOnly, startLine: node.startPosition.row + 1, endLine: node.endPosition.row + 1 }
  }

  // ─── Call extraction ─────────────────────────────────────────────────────

  private extractCalls(
    rootNode: Parser.SyntaxNode,
    config: LanguageConfig,
  ): ExtractedCall[] {
    const calls: ExtractedCall[] = []

    this.walkTree(rootNode, (node) => {
      if (!config.callNodes.includes(node.type)) return

      const info = extractCallNodeInfo(node, MAX_SIGNATURE_LENGTH)
      if (!info || !info.calleeName) return

      const argsNode = node.childForFieldName('arguments')
        ?? node.namedChildren.find((c) => c.type === 'arguments' || c.type === 'argument_list')
      const argCount = argsNode?.namedChildCount ?? 0

      calls.push({
        calleeName: info.calleeName,
        receiverName: info.receiverName,
        startLine: node.startPosition.row + 1,
        isAsync: info.isAsync,
        arguments: argCount,
      })
    })

    return calls
  }

  // ─── Route extraction ────────────────────────────────────────────────────

  private matchRoutePattern(
    node: Parser.SyntaxNode,
    candidate: { objectText: string; methodText: string },
    config: LanguageConfig,
    routes: ExtractedRoute[],
  ): void {
    const { objectText, methodText } = candidate
    for (const pattern of config.routePatterns) {
      const receiverMatch = pattern.receiverNames.length === 0 || pattern.receiverNames.includes(objectText)
      if (!receiverMatch || !pattern.methodNames.includes(methodText)) continue

      const argsNode = node.childForFieldName('arguments')
        ?? node.namedChildren.find((c) => c.type === 'arguments' || c.type === 'argument_list')
      if (!argsNode) continue

      const pathArg = argsNode.namedChildren[pattern.pathArgIndex]
      if (!pathArg) continue

      routes.push({
        method: methodText.toUpperCase(),
        path: pathArg.text.replace(/['"`]/g, ''),
        handlerName: extractHandlerName(argsNode, pattern.pathArgIndex),
        framework: pattern.framework,
        startLine: node.startPosition.row + 1,
      })
    }
  }

  private extractRoutes(
    rootNode: Parser.SyntaxNode,
    config: LanguageConfig,
  ): ExtractedRoute[] {
    if (config.routePatterns.length === 0) return []

    const routes: ExtractedRoute[] = []

    this.walkTree(rootNode, (node) => {
      if (!config.callNodes.includes(node.type)) return
      const candidate = extractRouteCandidate(node)
      if (!candidate.objectText || !candidate.methodText) return
      this.matchRoutePattern(node, { objectText: candidate.objectText, methodText: candidate.methodText }, config, routes)
    })

    return routes
  }

  // ─── Helper methods ──────────────────────────────────────────────────────

  private walkTree(node: Parser.SyntaxNode, callback: (node: Parser.SyntaxNode) => void): void {
    const stack: Parser.SyntaxNode[] = [node]
    while (stack.length > 0) {
      const current = stack.pop()!
      callback(current)
      const childCount = current.childCount
      for (let i = childCount - 1; i >= 0; i--) {
        const child = current.child(i)
        if (child) stack.push(child)
      }
    }
  }

  private extractExportedNames(rootNode: Parser.SyntaxNode, config: LanguageConfig): string[] {
    if (!config.exportKeyword) return extractTopLevelNames(rootNode, config)

    const names = new Set<string>()
    this.walkTree(rootNode, (node) => {
      if (node.type !== config.exportKeyword) return
      collectExportedIdentifiers(node, this.walkTree.bind(this), names)
    })
    return Array.from(names)
  }

  // ─── Lifecycle ────────────────────────────────────────────────────────

  dispose(): void {
    if (this.parser) {
      this.parser.delete()
      this.parser = null
    }
    this.languages.clear()
    this.initialized = false
  }
}

// Re-export for type compatibility
export type { ImportSpecifier }
