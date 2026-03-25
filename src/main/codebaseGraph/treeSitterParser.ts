/**
 * treeSitterParser.ts — WASM-based tree-sitter parser for multi-language
 * source code analysis. Extracts definitions, imports, calls, and routes.
 *
 * Usage:
 *   const parser = new TreeSitterParser()
 *   await parser.init()
 *   const result = await parser.parseFile('src/main/config.ts', sourceCode)
 *   parser.dispose()
 *
 * Memory management: tree-sitter WASM objects must be manually freed.
 * The parser handles this internally — parsed trees are deleted after extraction.
 */

import Parser from 'web-tree-sitter'
import path from 'path'
import type {
  ParsedFileResult, ExtractedDefinition, ExtractedImport,
  ExtractedCall, ExtractedRoute, LanguageConfig, LanguageId,
  NodeLabel, ImportSpecifier,
} from './treeSitterTypes'
import { getLanguageConfig } from './treeSitterLanguageConfigs'

/** Maximum length for extracted signatures before truncation. */
const MAX_SIGNATURE_LENGTH = 200

/**
 * Languages that support TypeScript/JavaScript-style syntax constructs
 * (arrow functions, export statements, named/default/namespace imports).
 */
const TS_JS_LANGUAGES = new Set<LanguageId>(['typescript', 'tsx', 'javascript', 'jsx'])

export class TreeSitterParser {
  private parser: Parser | null = null
  private languages = new Map<LanguageId, Parser.Language>()
  private initialized = false

  // ─── Initialization ──────────────────────────────────────────────────────

  /**
   * Initialize the WASM runtime. Must be called once before any parsing.
   * Safe to call multiple times (idempotent).
   */
  async init(): Promise<void> {
    if (this.initialized) return

    await Parser.init({
      locateFile(scriptName: string) {
        // web-tree-sitter needs its own WASM runtime file (tree-sitter.wasm).
        // Resolve from the web-tree-sitter package directory so it works
        // both in dev (node_modules) and in packaged Electron (asar unpacked).
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

  // ─── Language loading (lazy, on first use per language) ───────────────────

  /**
   * Load a tree-sitter grammar WASM from the tree-sitter-wasms package.
   * Caches loaded languages for reuse across files.
   */
  private async loadLanguage(config: LanguageConfig): Promise<Parser.Language> {
    const cached = this.languages.get(config.id)
    if (cached) return cached

    // Resolve WASM file from tree-sitter-wasms package
    const wasmDir = path.dirname(require.resolve('tree-sitter-wasms/package.json'))
    const wasmPath = path.join(wasmDir, 'out', config.wasmFile)

    const language = await Parser.Language.load(wasmPath)
    this.languages.set(config.id, language)
    return language
  }

  // ─── Main entry point ────────────────────────────────────────────────────

  /**
   * Parse a source file and extract definitions, imports, calls, and routes.
   *
   * @param relativePath - Relative file path (used for language detection and result metadata)
   * @param source - The full source code text
   * @returns ParsedFileResult or null if the language is unsupported
   */
  async parseFile(relativePath: string, source: string): Promise<ParsedFileResult | null> {
    if (!this.parser) throw new Error('TreeSitterParser not initialized — call init() first')

    const ext = path.extname(relativePath).slice(1)
    const config = getLanguageConfig(ext)
    if (!config) return null  // Unsupported language

    const language = await this.loadLanguage(config)
    this.parser.setLanguage(language)

    const tree = this.parser.parse(source)
    if (!tree) return null  // Parse was cancelled or language not set

    try {
      const definitions = this.extractDefinitions(tree.rootNode, config, source)
      const imports = this.extractImports(tree.rootNode, config)
      const calls = this.extractCalls(tree.rootNode, config)
      const routes = this.extractRoutes(tree.rootNode, config)
      const exportedNames = this.extractExportedNames(tree.rootNode, config)

      return {
        filePath: relativePath,
        language: config.id,
        lineCount: tree.rootNode.endPosition.row + 1,
        definitions,
        imports,
        calls,
        routes,
        exportedNames,
      }
    } finally {
      tree.delete()  // CRITICAL: free WASM memory
    }
  }

  // ─── Definition extraction ───────────────────────────────────────────────

  /**
   * Walk the AST looking for definition node types (functions, classes,
   * interfaces, types, enums, methods). For each match, extract name,
   * signature, export status, decorators, etc.
   */
  private extractDefinitions(
    rootNode: Parser.Node,
    config: LanguageConfig,
    source: string,
  ): ExtractedDefinition[] {
    const definitions: ExtractedDefinition[] = []

    // Build a lookup from tree-sitter node type to our graph label
    const nodeTypeToLabel = new Map<string, NodeLabel>()
    for (const t of config.functionNodes) nodeTypeToLabel.set(t, 'Function')
    for (const t of config.classNodes) nodeTypeToLabel.set(t, 'Class')
    for (const t of config.interfaceNodes) nodeTypeToLabel.set(t, 'Interface')
    for (const t of config.typeNodes) nodeTypeToLabel.set(t, 'Type')
    for (const t of config.enumNodes) nodeTypeToLabel.set(t, 'Enum')
    for (const t of config.methodNodes) nodeTypeToLabel.set(t, 'Method')

    // Walk the tree looking for definition nodes
    this.walkTree(rootNode, (node) => {
      const label = nodeTypeToLabel.get(node.type)
      if (!label) return

      const def = this.extractSingleDefinition(node, label, config, source)
      if (def) definitions.push(def)
    })

    // Also extract arrow functions / const assignments that are exported
    // Pattern: export const foo = () => { ... }
    if (TS_JS_LANGUAGES.has(config.id)) {
      this.extractArrowFunctionExports(rootNode, definitions, source)
    }

    return definitions
  }

  /**
   * Extract a single definition from a tree-sitter node.
   * Returns null if the node cannot be meaningfully extracted (e.g. missing name).
   */
  private extractSingleDefinition(
    node: Parser.Node,
    label: NodeLabel,
    config: LanguageConfig,
    source: string,
  ): ExtractedDefinition | null {
    // Get the name — try the 'name' field first, then fall back to
    // searching for an identifier child
    const nameNode = node.childForFieldName('name')
      ?? node.namedChildren.find(c =>
        c.type === 'identifier'
        || c.type === 'type_identifier'
        || c.type === 'property_identifier'
      )
    if (!nameNode) return null

    const name = nameNode.text

    // Determine export status
    const isExported = this.isNodeExported(node, config)
    const isDefault = this.isDefaultExport(node)

    // Extract signature (for functions/methods)
    let signature: string | null = null
    let returnType: string | null = null
    if (label === 'Function' || label === 'Method') {
      signature = this.extractSignature(node, source)
      returnType = this.extractReturnType(node)
    }

    // Check for decorators (TypeScript/Python/Java)
    const decorators = this.extractDecorators(node)

    // Check async modifier
    const isAsync = this.hasModifier(node, 'async')

    // Check static (for methods)
    const isStatic = label === 'Method' && this.hasModifier(node, 'static')

    // Check abstract — either in the node type name or as a modifier
    const isAbstract = node.type.includes('abstract') || this.hasModifier(node, 'abstract')

    // Get receiver for methods (the enclosing class name)
    let receiver: string | null = null
    if (label === 'Method') {
      const classNode = this.findAncestorOfType(node, config.classNodes)
      if (classNode) {
        const classNameNode = classNode.childForFieldName('name')
        receiver = classNameNode?.text ?? null
      }
    }

    return {
      name,
      kind: label,
      signature,
      returnType,
      startLine: node.startPosition.row + 1,  // Convert to 1-based
      endLine: node.endPosition.row + 1,
      isExported,
      isDefault,
      isAsync,
      isStatic,
      isAbstract,
      decorators,
      receiver,
      constants: [],
    }
  }

  // ─── Arrow function / const export extraction (TS/JS) ────────────────────

  /**
   * Extract arrow function exports that look like:
   *   export const foo = (params) => { ... }
   *   export const bar = async (params): Promise<T> => { ... }
   *   export const baz = function(params) { ... }
   *
   * AST shape: export_statement > lexical_declaration > variable_declarator
   *   where variable_declarator.value is arrow_function or function
   */
  private extractArrowFunctionExports(
    rootNode: Parser.Node,
    definitions: ExtractedDefinition[],
    source: string,
  ): void {
    // Track already-extracted names to avoid duplicates
    const existingNames = new Set(definitions.map(d => d.name))

    this.walkTree(rootNode, (node) => {
      if (node.type !== 'export_statement') return

      const declaration = node.namedChildren.find(c =>
        c.type === 'lexical_declaration' || c.type === 'variable_declaration'
      )
      if (!declaration) return

      for (const declarator of declaration.namedChildren) {
        if (declarator.type !== 'variable_declarator') continue

        const nameNode = declarator.childForFieldName('name')
        const valueNode = declarator.childForFieldName('value')

        if (!nameNode || !valueNode) continue
        if (valueNode.type !== 'arrow_function' && valueNode.type !== 'function') continue

        const name = nameNode.text

        // Skip if already extracted as a regular function declaration
        if (existingNames.has(name)) continue
        existingNames.add(name)

        // Determine if async — check the value node for the 'async' keyword
        const isAsync = this.hasModifier(valueNode, 'async')
          || valueNode.text.startsWith('async')

        definitions.push({
          name,
          kind: 'Function',
          signature: this.extractSignature(valueNode, source),
          returnType: this.extractReturnType(valueNode)
            ?? this.extractReturnTypeFromAnnotation(declarator),
          startLine: node.startPosition.row + 1,
          endLine: node.endPosition.row + 1,
          isExported: true,
          isDefault: this.isDefaultExport(node),
          isAsync,
          isStatic: false,
          isAbstract: false,
          decorators: [],
          receiver: null,
          constants: [],
        })
      }
    })
  }

  // ─── Import extraction ───────────────────────────────────────────────────

  /**
   * Extract import declarations from the AST.
   * Handles TypeScript/JavaScript (named, default, namespace, type-only imports)
   * and Python (import_from_statement) patterns.
   */
  private extractImports(
    rootNode: Parser.Node,
    config: LanguageConfig,
  ): ExtractedImport[] {
    const imports: ExtractedImport[] = []

    this.walkTree(rootNode, (node) => {
      if (!config.importNodes.includes(node.type)) return

      // ── TypeScript / JavaScript imports ────────────────────────────────
      if (TS_JS_LANGUAGES.has(config.id)) {
        const importResult = this.extractTsJsImport(node)
        if (importResult) imports.push(importResult)
        return
      }

      // ── Python imports ─────────────────────────────────────────────────
      if (config.id === 'python') {
        const importResult = this.extractPythonImport(node)
        if (importResult) imports.push(importResult)
        return
      }

      // ── Go imports ─────────────────────────────────────────────────────
      if (config.id === 'go') {
        const importResult = this.extractGoImport(node)
        if (importResult) {
          // Go import_declaration can produce multiple imports
          for (const imp of importResult) imports.push(imp)
        }
        return
      }

      // ── Rust use declarations ──────────────────────────────────────────
      if (config.id === 'rust') {
        const importResult = this.extractRustImport(node)
        if (importResult) imports.push(importResult)
        return
      }

      // ── Java/C# import declarations ───────────────────────────────────
      if (config.id === 'java' || config.id === 'c_sharp') {
        const importResult = this.extractJavaLikeImport(node)
        if (importResult) imports.push(importResult)
        return
      }

      // ── C/C++ #include ─────────────────────────────────────────────────
      if (config.id === 'c' || config.id === 'cpp') {
        const importResult = this.extractCInclude(node)
        if (importResult) imports.push(importResult)
        return
      }

      // ── Ruby require (call nodes) ──────────────────────────────────────
      if (config.id === 'ruby') {
        const importResult = this.extractRubyImport(node)
        if (importResult) imports.push(importResult)
        return
      }

      // ── PHP namespace use ──────────────────────────────────────────────
      if (config.id === 'php') {
        const importResult = this.extractPhpImport(node)
        if (importResult) imports.push(importResult)
        return
      }
    })

    return imports
  }

  /**
   * Extract a TypeScript/JavaScript import statement.
   * Handles: import { a, b } from 'mod'
   *          import type { T } from 'mod'
   *          import Foo from 'mod'
   *          import * as ns from 'mod'
   *          import 'mod' (side-effect import)
   */
  private extractTsJsImport(node: Parser.Node): ExtractedImport | null {
    const sourceNode = node.childForFieldName('source')
    if (!sourceNode) return null

    const importSource = sourceNode.text.replace(/['"]/g, '')
    const specifiers: ImportSpecifier[] = []
    let isTypeOnly = false

    // Check for `import type { ... }` — the word 'type' appears as a
    // child node directly after the 'import' keyword node
    const children = node.children
    for (let i = 0; i < children.length - 1; i++) {
      if (children[i].type === 'import' && children[i + 1]?.type === 'type') {
        isTypeOnly = true
        break
      }
    }

    // Named imports: import { a, b as c } from '...'
    const namedImports = node.descendantsOfType('import_specifier')
    for (const spec of namedImports) {
      const nameNode = spec.childForFieldName('name') ?? spec.firstNamedChild
      const aliasNode = spec.childForFieldName('alias')
      if (nameNode) {
        specifiers.push({
          name: aliasNode?.text ?? nameNode.text,
          originalName: aliasNode ? nameNode.text : null,
          isDefault: false,
          isNamespace: false,
        })
      }
    }

    // Default import: import Foo from '...'
    // The default import identifier sits inside an import_clause node
    // but is NOT wrapped in an import_specifier
    const importClause = node.namedChildren.find(c => c.type === 'import_clause')
    if (importClause) {
      // The identifier direct child of import_clause that isn't inside
      // a named_imports or namespace_import
      for (const child of importClause.namedChildren) {
        if (child.type === 'identifier') {
          // Only add if not already captured as a named import
          if (!specifiers.some(s => s.name === child.text)) {
            specifiers.push({
              name: child.text,
              originalName: null,
              isDefault: true,
              isNamespace: false,
            })
          }
        }
      }
    } else {
      // Some tree-sitter grammars place the default import identifier
      // directly in the import_statement node
      const defaultIdent = node.descendantsOfType('identifier')
        .find(n => n.parent?.type === 'import_clause' || n.parent?.type === node.type)
      if (defaultIdent
          && !specifiers.some(s => s.name === defaultIdent.text)
          && defaultIdent.text !== 'type') {
        // Verify this isn't inside named_imports or namespace_import
        const parent = defaultIdent.parent
        if (parent && parent.type !== 'named_imports' && parent.type !== 'namespace_import') {
          specifiers.push({
            name: defaultIdent.text,
            originalName: null,
            isDefault: true,
            isNamespace: false,
          })
        }
      }
    }

    // Namespace import: import * as ns from '...'
    const nsImports = node.descendantsOfType('namespace_import')
    for (const ns of nsImports) {
      const nameNode = ns.lastNamedChild
      if (nameNode && nameNode.type === 'identifier') {
        specifiers.push({
          name: nameNode.text,
          originalName: null,
          isDefault: false,
          isNamespace: true,
        })
      }
    }

    return {
      source: importSource,
      specifiers,
      isTypeOnly,
      startLine: node.startPosition.row + 1,
      endLine: node.endPosition.row + 1,
    }
  }

  /**
   * Extract a Python import or import_from_statement.
   * Handles: from module import name1, name2
   *          from module import name as alias
   *          import module
   */
  private extractPythonImport(node: Parser.Node): ExtractedImport | null {
    if (node.type === 'import_from_statement') {
      const moduleNode = node.childForFieldName('module_name')
      if (!moduleNode) return null

      const importSource = moduleNode.text
      const specifiers: ImportSpecifier[] = []

      for (const child of node.namedChildren) {
        if (child === moduleNode) continue

        if (child.type === 'dotted_name') {
          specifiers.push({
            name: child.text,
            originalName: null,
            isDefault: false,
            isNamespace: false,
          })
        }
        if (child.type === 'aliased_import') {
          const nameNode = child.firstNamedChild
          const aliasNode = child.lastNamedChild
          if (nameNode) {
            specifiers.push({
              name: (aliasNode && aliasNode !== nameNode) ? aliasNode.text : nameNode.text,
              originalName: (aliasNode && aliasNode !== nameNode) ? nameNode.text : null,
              isDefault: false,
              isNamespace: false,
            })
          }
        }
      }

      return {
        source: importSource,
        specifiers,
        isTypeOnly: false,
        startLine: node.startPosition.row + 1,
        endLine: node.endPosition.row + 1,
      }
    }

    // Plain import statement: import os, import os.path
    if (node.type === 'import_statement') {
      const names = node.descendantsOfType('dotted_name')
      if (names.length === 0) return null

      // Each dotted name is a separate module import
      const importSource = names[0].text
      const specifiers: ImportSpecifier[] = [{
        name: importSource.split('.').pop() ?? importSource,
        originalName: null,
        isDefault: false,
        isNamespace: true,
      }]

      // Check for aliased imports
      const aliases = node.descendantsOfType('aliased_import')
      if (aliases.length > 0) {
        specifiers.length = 0
        for (const alias of aliases) {
          const nameNode = alias.firstNamedChild
          const aliasNode = alias.lastNamedChild
          if (nameNode) {
            specifiers.push({
              name: (aliasNode && aliasNode !== nameNode) ? aliasNode.text : nameNode.text,
              originalName: (aliasNode && aliasNode !== nameNode) ? nameNode.text : null,
              isDefault: false,
              isNamespace: true,
            })
          }
        }
      }

      return {
        source: importSource,
        specifiers,
        isTypeOnly: false,
        startLine: node.startPosition.row + 1,
        endLine: node.endPosition.row + 1,
      }
    }

    return null
  }

  /**
   * Extract Go import declarations.
   * Handles: import "fmt"
   *          import ( "fmt" ; "os" )
   */
  private extractGoImport(node: Parser.Node): ExtractedImport[] | null {
    if (node.type !== 'import_declaration') return null

    const results: ExtractedImport[] = []

    // Single import: import "fmt"
    const interpretedStrings = node.descendantsOfType('interpreted_string_literal')
    for (const strNode of interpretedStrings) {
      const importSource = strNode.text.replace(/"/g, '')
      const shortName = importSource.split('/').pop() ?? importSource

      results.push({
        source: importSource,
        specifiers: [{
          name: shortName,
          originalName: null,
          isDefault: false,
          isNamespace: true,
        }],
        isTypeOnly: false,
        startLine: strNode.startPosition.row + 1,
        endLine: strNode.endPosition.row + 1,
      })
    }

    return results.length > 0 ? results : null
  }

  /**
   * Extract Rust use declarations.
   * Handles: use std::collections::HashMap;
   *          use crate::module::{Type1, Type2};
   */
  private extractRustImport(node: Parser.Node): ExtractedImport | null {
    if (node.type !== 'use_declaration') return null

    // The path is the full text minus 'use' and ';'
    const pathNode = node.namedChildren[0]
    if (!pathNode) return null

    const importSource = pathNode.text.replace(/;$/, '').trim()
    const shortName = importSource.split('::').pop() ?? importSource

    return {
      source: importSource,
      specifiers: [{
        name: shortName.replace(/[{}]/g, '').trim(),
        originalName: null,
        isDefault: false,
        isNamespace: false,
      }],
      isTypeOnly: false,
      startLine: node.startPosition.row + 1,
      endLine: node.endPosition.row + 1,
    }
  }

  /**
   * Extract Java/C# import/using declarations.
   */
  private extractJavaLikeImport(node: Parser.Node): ExtractedImport | null {
    // Get the full qualified name from the import
    const scopedIdent = node.descendantsOfType('scoped_identifier')
    const ident = scopedIdent.length > 0
      ? scopedIdent[scopedIdent.length - 1]
      : node.namedChildren[0]

    if (!ident) return null

    const importSource = ident.text
    const shortName = importSource.split('.').pop() ?? importSource

    return {
      source: importSource,
      specifiers: [{
        name: shortName,
        originalName: null,
        isDefault: false,
        isNamespace: shortName === '*',
      }],
      isTypeOnly: false,
      startLine: node.startPosition.row + 1,
      endLine: node.endPosition.row + 1,
    }
  }

  /**
   * Extract C/C++ #include directives.
   * Handles: #include <stdio.h>
   *          #include "myheader.h"
   */
  private extractCInclude(node: Parser.Node): ExtractedImport | null {
    if (node.type !== 'preproc_include') return null

    const pathNode = node.namedChildren.find(c =>
      c.type === 'string_literal' || c.type === 'system_lib_string'
    )
    if (!pathNode) return null

    const importSource = pathNode.text.replace(/[<>"]/g, '')

    return {
      source: importSource,
      specifiers: [{
        name: importSource.replace(/\.h(pp)?$/, '').split('/').pop() ?? importSource,
        originalName: null,
        isDefault: false,
        isNamespace: true,
      }],
      isTypeOnly: false,
      startLine: node.startPosition.row + 1,
      endLine: node.endPosition.row + 1,
    }
  }

  /**
   * Extract Ruby require/require_relative calls.
   * Only extracts calls where the method name is 'require' or 'require_relative'.
   */
  private extractRubyImport(node: Parser.Node): ExtractedImport | null {
    if (node.type !== 'call') return null

    const methodNode = node.childForFieldName('method')
    if (!methodNode) return null

    const methodName = methodNode.text
    if (methodName !== 'require' && methodName !== 'require_relative') return null

    const argsNode = node.childForFieldName('arguments')
    if (!argsNode) return null

    const firstArg = argsNode.firstNamedChild
    if (!firstArg) return null

    const importSource = firstArg.text.replace(/['"]/g, '')

    return {
      source: importSource,
      specifiers: [{
        name: importSource.split('/').pop() ?? importSource,
        originalName: null,
        isDefault: false,
        isNamespace: true,
      }],
      isTypeOnly: false,
      startLine: node.startPosition.row + 1,
      endLine: node.endPosition.row + 1,
    }
  }

  /**
   * Extract PHP namespace use declarations.
   * Handles: use App\Models\User;
   */
  private extractPhpImport(node: Parser.Node): ExtractedImport | null {
    if (node.type !== 'namespace_use_declaration') return null

    const nameNode = node.descendantsOfType('qualified_name')[0]
      ?? node.descendantsOfType('name')[0]
    if (!nameNode) return null

    const importSource = nameNode.text
    const shortName = importSource.split('\\').pop() ?? importSource

    return {
      source: importSource,
      specifiers: [{
        name: shortName,
        originalName: null,
        isDefault: false,
        isNamespace: false,
      }],
      isTypeOnly: false,
      startLine: node.startPosition.row + 1,
      endLine: node.endPosition.row + 1,
    }
  }

  // ─── Call extraction ─────────────────────────────────────────────────────

  /**
   * Extract function/method call expressions from the AST.
   * Handles call_expression, new_expression, method_invocation, and
   * language-specific call node types.
   */
  private extractCalls(
    rootNode: Parser.Node,
    config: LanguageConfig,
  ): ExtractedCall[] {
    const calls: ExtractedCall[] = []

    this.walkTree(rootNode, (node) => {
      if (!config.callNodes.includes(node.type)) return

      let calleeName: string | null = null
      let receiverName: string | null = null
      let isAsync = false

      // ── call_expression: foo(args) or obj.method(args) ──────────────
      if (node.type === 'call_expression' || node.type === 'call') {
        const fnNode = node.childForFieldName('function')
          ?? node.childForFieldName('method')
          ?? node.firstNamedChild

        if (!fnNode) return

        if (fnNode.type === 'member_expression' || fnNode.type === 'field_expression') {
          // obj.method(args) or obj->method(args)
          const objectNode = fnNode.childForFieldName('object')
          const propertyNode = fnNode.childForFieldName('property')
            ?? fnNode.childForFieldName('field')
          receiverName = objectNode?.text ?? null
          calleeName = propertyNode?.text ?? null
        } else if (fnNode.type === 'identifier' || fnNode.type === 'scoped_identifier') {
          calleeName = fnNode.text
        } else if (fnNode.type === 'attribute') {
          // Python: obj.method()
          const objectNode = fnNode.childForFieldName('object')
          const attrNode = fnNode.childForFieldName('attribute')
          receiverName = objectNode?.text ?? null
          calleeName = attrNode?.text ?? null
        } else {
          // Skip complex expressions (IIFEs, computed property calls, etc.)
          return
        }
      }

      // ── new_expression: new Foo(args) ────────────────────────────────
      if (node.type === 'new_expression') {
        const constructorNode = node.childForFieldName('constructor')
          ?? node.firstNamedChild
        calleeName = constructorNode?.text ?? null
      }

      // ── Java method_invocation ───────────────────────────────────────
      if (node.type === 'method_invocation') {
        const objectNode = node.childForFieldName('object')
        const nameNode = node.childForFieldName('name')
        receiverName = objectNode?.text ?? null
        calleeName = nameNode?.text ?? null
      }

      // ── Java/C# object_creation_expression ───────────────────────────
      if (node.type === 'object_creation_expression') {
        const typeNode = node.childForFieldName('type')
        calleeName = typeNode?.text ?? null
      }

      // ── C# invocation_expression ─────────────────────────────────────
      if (node.type === 'invocation_expression') {
        const fnNode = node.childForFieldName('function') ?? node.firstNamedChild
        if (fnNode) {
          if (fnNode.type === 'member_access_expression') {
            const objectNode = fnNode.childForFieldName('expression')
            const nameNode = fnNode.childForFieldName('name')
            receiverName = objectNode?.text ?? null
            calleeName = nameNode?.text ?? null
          } else {
            calleeName = fnNode.text
          }
        }
      }

      // ── Ruby call / method_call ──────────────────────────────────────
      if (node.type === 'method_call') {
        const methodNode = node.childForFieldName('method')
        calleeName = methodNode?.text ?? null
      }

      // ── PHP function_call_expression / method_call_expression ────────
      if (node.type === 'function_call_expression') {
        const fnNode = node.childForFieldName('function') ?? node.firstNamedChild
        calleeName = fnNode?.text ?? null
      }
      if (node.type === 'method_call_expression') {
        const objectNode = node.childForFieldName('object')
        const nameNode = node.childForFieldName('name')
        receiverName = objectNode?.text ?? null
        calleeName = nameNode?.text ?? null
      }

      if (!calleeName) return

      // Truncate long receiver names to keep data manageable
      if (receiverName && receiverName.length > MAX_SIGNATURE_LENGTH) {
        receiverName = receiverName.slice(0, MAX_SIGNATURE_LENGTH)
      }

      // Check if the call is awaited or chained with .then()
      const parent = node.parent
      if (parent) {
        isAsync = parent.type === 'await_expression'
          || (parent.type === 'member_expression'
              && parent.parent?.type === 'call_expression'
              && parent.childForFieldName('property')?.text === 'then')
      }

      // Count arguments
      const argsNode = node.childForFieldName('arguments')
        ?? node.namedChildren.find(c =>
          c.type === 'arguments'
          || c.type === 'argument_list'
        )
      const argCount = argsNode?.namedChildCount ?? 0

      calls.push({
        calleeName,
        receiverName,
        startLine: node.startPosition.row + 1,
        isAsync,
        arguments: argCount,
      })
    })

    return calls
  }

  // ─── Route extraction ────────────────────────────────────────────────────

  /**
   * Extract route definitions by matching call expressions against
   * the language's route patterns. Detects Express, FastAPI, Gin, etc.
   */
  private extractRoutes(
    rootNode: Parser.Node,
    config: LanguageConfig,
  ): ExtractedRoute[] {
    if (config.routePatterns.length === 0) return []

    const routes: ExtractedRoute[] = []

    this.walkTree(rootNode, (node) => {
      // Routes are always method calls — look for call_expression or
      // language-specific call nodes
      if (!config.callNodes.includes(node.type)) return

      const fnNode = node.childForFieldName('function')
        ?? node.childForFieldName('method')
        ?? node.firstNamedChild

      if (!fnNode) return

      // We need a member expression pattern: receiver.method(path, handler)
      let objectText: string | null = null
      let methodText: string | null = null

      if (fnNode.type === 'member_expression' || fnNode.type === 'field_expression') {
        const objectNode = fnNode.childForFieldName('object')
        const methodNode = fnNode.childForFieldName('property')
          ?? fnNode.childForFieldName('field')
        objectText = objectNode?.text ?? null
        methodText = methodNode?.text ?? null
      } else if (fnNode.type === 'attribute') {
        // Python: app.get(path, handler)
        const objectNode = fnNode.childForFieldName('object')
        const attrNode = fnNode.childForFieldName('attribute')
        objectText = objectNode?.text ?? null
        methodText = attrNode?.text ?? null
      }

      if (!objectText || !methodText) return

      for (const pattern of config.routePatterns) {
        const receiverMatch = pattern.receiverNames.length === 0
          || pattern.receiverNames.includes(objectText)
        const methodMatch = pattern.methodNames.includes(methodText)

        if (!receiverMatch || !methodMatch) continue

        // Extract path from the appropriate argument
        const argsNode = node.childForFieldName('arguments')
          ?? node.namedChildren.find(c =>
            c.type === 'arguments' || c.type === 'argument_list'
          )
        if (!argsNode) continue

        const pathArg = argsNode.namedChildren[pattern.pathArgIndex]
        if (!pathArg) continue

        const routePath = pathArg.text.replace(/['"`]/g, '')

        // Try to find handler name (usually the next argument after the path)
        let handlerName: string | null = null
        const handlerArg = argsNode.namedChildren[pattern.pathArgIndex + 1]
        if (handlerArg) {
          if (handlerArg.type === 'identifier') {
            handlerName = handlerArg.text
          } else if (handlerArg.type === 'member_expression') {
            // e.g. controller.handleUsers
            const prop = handlerArg.childForFieldName('property')
            handlerName = prop?.text ?? null
          }
        }

        routes.push({
          method: methodText.toUpperCase(),
          path: routePath,
          handlerName,
          framework: pattern.framework,
          startLine: node.startPosition.row + 1,
        })
      }
    })

    return routes
  }

  // ─── Helper methods ──────────────────────────────────────────────────────

  /**
   * Depth-first walk of the syntax tree, calling the callback for every node.
   * Uses iterative traversal with an explicit stack to avoid call stack
   * overflow on deeply nested ASTs.
   */
  private walkTree(node: Parser.Node, callback: (node: Parser.Node) => void): void {
    const stack: Parser.Node[] = [node]
    while (stack.length > 0) {
      const current = stack.pop()!
      callback(current)
      // Push children in reverse order so left-to-right traversal is maintained
      const childCount = current.childCount
      for (let i = childCount - 1; i >= 0; i--) {
        const child = current.child(i)
        if (child) stack.push(child)
      }
    }
  }

  // ─── Export detection ────────────────────────────────────────────────────

  /**
   * Determine if a node is exported.
   * - TypeScript/JavaScript: parent is export_statement
   * - Go: name starts with uppercase letter
   * - Rust: has 'pub' visibility modifier
   * - Java/C#: has 'public' access modifier
   * - Other languages: default to true (assume exported)
   */
  private isNodeExported(node: Parser.Node, config: LanguageConfig): boolean {
    if (config.exportKeyword) {
      // TypeScript/JavaScript: parent is export_statement
      return node.parent?.type === config.exportKeyword
    }

    // Go: uppercase first letter = exported
    if (config.id === 'go') {
      const nameNode = node.childForFieldName('name')
      return nameNode ? /^[A-Z]/.test(nameNode.text) : false
    }

    // Rust: has `pub` modifier
    if (config.id === 'rust') {
      return this.hasModifier(node, 'visibility_modifier')
        || node.children.some(c => c.type === 'visibility_modifier')
    }

    // Java/C#: has `public` modifier — check for access modifiers
    if (config.id === 'java' || config.id === 'c_sharp') {
      const modifiers = node.childForFieldName('modifiers')
        ?? node.namedChildren.find(c => c.type === 'modifiers' || c.type === 'modifier')
      if (modifiers) {
        return modifiers.text.includes('public')
      }
      return false
    }

    // Python, Ruby, PHP: no explicit export concept, assume exported
    return true
  }

  /**
   * Check if a node is a default export.
   * Only applies to TypeScript/JavaScript.
   */
  private isDefaultExport(node: Parser.Node): boolean {
    const parent = node.parent
    if (!parent || parent.type !== 'export_statement') return false
    return parent.children.some(c => c.type === 'default')
  }

  // ─── Signature extraction ──────────────────────────────────────────────

  /**
   * Extract a function/method signature string from the AST node.
   * Includes parameter list and return type (if present).
   * Truncates to MAX_SIGNATURE_LENGTH characters.
   */
  private extractSignature(node: Parser.Node, _source: string): string | null {
    // Try the 'parameters' field first, then look for formal_parameters
    const paramsNode = node.childForFieldName('parameters')
      ?? node.namedChildren.find(c =>
        c.type === 'formal_parameters'
        || c.type === 'parameter_list'
      )
    if (!paramsNode) return null

    let sig = paramsNode.text
    const returnType = this.extractReturnType(node)
    if (returnType) sig += `: ${returnType}`

    // Normalize whitespace and truncate
    sig = sig.replace(/\s+/g, ' ').trim()
    if (sig.length > MAX_SIGNATURE_LENGTH) {
      sig = sig.slice(0, MAX_SIGNATURE_LENGTH - 3) + '...'
    }

    return sig
  }

  /**
   * Extract the return type from a function/method node.
   * Looks for a return_type field or a type_annotation that follows
   * the parameter list closing paren.
   */
  private extractReturnType(node: Parser.Node): string | null {
    // Try the standard 'return_type' field
    const returnTypeNode = node.childForFieldName('return_type')
    if (returnTypeNode) {
      return returnTypeNode.text.replace(/^:\s*/, '').trim()
    }

    // Look for type_annotation nodes that appear after the parameters
    // This handles TypeScript arrow functions: (x: string): boolean => ...
    const paramsNode = node.childForFieldName('parameters')
    if (paramsNode) {
      // Find a type_annotation sibling after the params
      let sibling = paramsNode.nextNamedSibling
      while (sibling) {
        if (sibling.type === 'type_annotation') {
          return sibling.text.replace(/^:\s*/, '').trim()
        }
        // Stop if we hit the function body
        if (sibling.type === 'statement_block'
            || sibling.type === 'block'
            || sibling.type === 'arrow_function'
            || sibling.type === '=>') {
          break
        }
        sibling = sibling.nextNamedSibling
      }
    }

    return null
  }

  /**
   * For variable_declarator nodes (e.g. `const foo: Type = ...`),
   * extract the type annotation if it exists.
   */
  private extractReturnTypeFromAnnotation(declarator: Parser.Node): string | null {
    const typeAnnotation = declarator.childForFieldName('type')
      ?? declarator.namedChildren.find(c => c.type === 'type_annotation')
    if (!typeAnnotation) return null
    return typeAnnotation.text.replace(/^:\s*/, '').trim()
  }

  // ─── Decorator extraction ─────────────────────────────────────────────

  /**
   * Extract decorator names from preceding sibling nodes.
   * Works for TypeScript/JavaScript (@decorator), Python (@decorator),
   * and Java (@Annotation) patterns.
   */
  private extractDecorators(node: Parser.Node): string[] {
    const decorators: string[] = []

    // Walk backwards through previous named siblings looking for decorators
    let sibling = node.previousNamedSibling
    while (sibling && sibling.type === 'decorator') {
      // Extract the decorator name — strip @, strip arguments
      const name = sibling.firstNamedChild?.text ?? sibling.text
      decorators.push(name.replace(/^@/, ''))
      sibling = sibling.previousNamedSibling
    }

    // Also check for Java/C#-style annotations (marker_annotation, annotation)
    sibling = node.previousNamedSibling
    while (sibling && (sibling.type === 'marker_annotation' || sibling.type === 'annotation')) {
      const name = sibling.childForFieldName('name')?.text
        ?? sibling.text.replace(/^@/, '')
      if (!decorators.includes(name)) {
        decorators.push(name)
      }
      sibling = sibling.previousNamedSibling
    }

    return decorators
  }

  // ─── Modifier checks ──────────────────────────────────────────────────

  /**
   * Check if a node has a specific modifier keyword as a direct child.
   * Checks both named and unnamed children (modifiers like 'async', 'static',
   * 'abstract' appear as anonymous keyword nodes in tree-sitter).
   */
  private hasModifier(node: Parser.Node, modifier: string): boolean {
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i)
      if (child && child.type === modifier) return true
    }

    // Also check inside a 'modifiers' container (Java/C#)
    const modifiers = node.childForFieldName('modifiers')
    if (modifiers) {
      for (let i = 0; i < modifiers.childCount; i++) {
        const child = modifiers.child(i)
        if (child && child.type === modifier) return true
      }
    }

    return false
  }

  // ─── Ancestor lookup ──────────────────────────────────────────────────

  /**
   * Walk up the parent chain to find an ancestor whose type is in the
   * given set of types. Returns null if no matching ancestor is found.
   */
  private findAncestorOfType(node: Parser.Node, types: string[]): Parser.Node | null {
    if (types.length === 0) return null
    let current = node.parent
    while (current) {
      if (types.includes(current.type)) return current
      current = current.parent
    }
    return null
  }

  // ─── Export name extraction ───────────────────────────────────────────

  /**
   * Extract all exported names from a file.
   * For TypeScript/JavaScript, walks export_statement nodes and collects
   * identifier and type_identifier children.
   */
  private extractExportedNames(rootNode: Parser.Node, config: LanguageConfig): string[] {
    if (!config.exportKeyword) {
      // For languages without explicit export keywords, collect all
      // top-level definition names
      return this.extractTopLevelNames(rootNode, config)
    }

    const names = new Set<string>()

    this.walkTree(rootNode, (node) => {
      if (node.type !== config.exportKeyword) return

      // Collect all identifiers and type_identifiers within export statements,
      // but skip those inside import clauses (re-export sources)
      this.walkTree(node, (child) => {
        if (child.type === 'identifier' || child.type === 'type_identifier') {
          // Skip identifiers that are part of module specifiers (string values)
          const parent = child.parent
          if (parent
              && parent.type !== 'import_clause'
              && parent.type !== 'string'
              && parent.type !== 'template_string') {
            names.add(child.text)
          }
        }
      })
    })

    return Array.from(names)
  }

  /**
   * For languages without explicit export syntax, collect names of top-level
   * definitions. Used by Go (uppercase names), Python, Ruby, etc.
   */
  private extractTopLevelNames(rootNode: Parser.Node, config: LanguageConfig): string[] {
    const names: string[] = []
    const definitionTypes = new Set([
      ...config.functionNodes,
      ...config.classNodes,
      ...config.interfaceNodes,
      ...config.typeNodes,
      ...config.enumNodes,
    ])

    // Only look at direct children of the root (top-level definitions)
    for (const child of rootNode.namedChildren) {
      if (!definitionTypes.has(child.type)) continue

      const nameNode = child.childForFieldName('name')
      if (nameNode) {
        // For Go, only include exported (uppercase) names
        if (config.id === 'go' && !/^[A-Z]/.test(nameNode.text)) continue
        names.push(nameNode.text)
      }
    }

    return names
  }

  // ─── Lifecycle ────────────────────────────────────────────────────────

  /**
   * Free all WASM resources. Call this when the parser is no longer needed.
   * After calling dispose(), the parser cannot be used until init() is
   * called again.
   */
  dispose(): void {
    if (this.parser) {
      this.parser.delete()
      this.parser = null
    }
    this.languages.clear()
    this.initialized = false
  }
}
