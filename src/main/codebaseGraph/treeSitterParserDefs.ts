/**
 * treeSitterParserDefs.ts — Definition-building and AST utility helpers
 * extracted from treeSitterParserSupport.ts to keep that file under 300 lines.
 *
 * Contains: buildNodeTypeToLabelMap, hasModifier, findAncestorOfType,
 * extractReturnType, extractReturnTypeFromAnnotation, extractNodeSignature,
 * extractTopLevelNames, extractSingleDefinition, extractArrowDeclarator,
 * isNodeExported, isDefaultExport, collectExportedIdentifiers.
 */

import type Parser from 'web-tree-sitter'

import {
  collectDecorators,
  extractDefinitionNameNode,
  isArrowOrFunctionValue,
  resolveExportStatus,
} from './treeSitterParserSupport'
import type { ExtractedDefinition, LanguageConfig, NodeLabel } from './treeSitterTypes'

// ─── Parser helper functions ──────────────────────────────────────────────────

const MAX_SIGNATURE_LENGTH = 200

export function buildNodeTypeToLabelMap(config: LanguageConfig): Map<string, string> {
  const map = new Map<string, string>()
  for (const t of config.functionNodes) map.set(t, 'Function')
  for (const t of config.classNodes) map.set(t, 'Class')
  for (const t of config.interfaceNodes) map.set(t, 'Interface')
  for (const t of config.typeNodes) map.set(t, 'Type')
  for (const t of config.enumNodes) map.set(t, 'Enum')
  for (const t of config.methodNodes) map.set(t, 'Method')
  return map
}

export function hasModifier(node: Parser.SyntaxNode, modifier: string): boolean {
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i)
    if (child && child.type === modifier) return true
  }
  const modifiers = node.childForFieldName('modifiers')
  if (modifiers) {
    for (let i = 0; i < modifiers.childCount; i++) {
      const child = modifiers.child(i)
      if (child && child.type === modifier) return true
    }
  }
  return false
}

export function findAncestorOfType(
  node: Parser.SyntaxNode,
  types: string[],
): Parser.SyntaxNode | null {
  if (types.length === 0) return null
  let current = node.parent
  while (current) {
    if (types.includes(current.type)) return current
    current = current.parent
  }
  return null
}

export function extractReturnType(node: Parser.SyntaxNode): string | null {
  const returnTypeNode = node.childForFieldName('return_type')
  if (returnTypeNode) return returnTypeNode.text.replace(/^:\s*/, '').trim()

  const paramsNode = node.childForFieldName('parameters')
  if (paramsNode) {
    let sibling = paramsNode.nextNamedSibling
    while (sibling) {
      if (sibling.type === 'type_annotation') return sibling.text.replace(/^:\s*/, '').trim()
      if (['statement_block', 'block', 'arrow_function', '=>'].includes(sibling.type)) break
      sibling = sibling.nextNamedSibling
    }
  }
  return null
}

export function extractReturnTypeFromAnnotation(declarator: Parser.SyntaxNode): string | null {
  const typeAnnotation = declarator.childForFieldName('type')
    ?? declarator.namedChildren.find((c) => c.type === 'type_annotation')
  if (!typeAnnotation) return null
  return typeAnnotation.text.replace(/^:\s*/, '').trim()
}

export function extractNodeSignature(node: Parser.SyntaxNode): string | null {
  const paramsNode = node.childForFieldName('parameters')
    ?? node.namedChildren.find((c) => c.type === 'formal_parameters' || c.type === 'parameter_list')
  if (!paramsNode) return null

  let sig = paramsNode.text
  const returnType = extractReturnType(node)
  if (returnType) sig += `: ${returnType}`

  sig = sig.replace(/\s+/g, ' ').trim()
  if (sig.length > MAX_SIGNATURE_LENGTH) sig = sig.slice(0, MAX_SIGNATURE_LENGTH - 3) + '...'
  return sig
}

export function extractTopLevelNames(
  rootNode: Parser.SyntaxNode,
  config: LanguageConfig,
): string[] {
  const names: string[] = []
  const definitionTypes = new Set([
    ...config.functionNodes, ...config.classNodes, ...config.interfaceNodes,
    ...config.typeNodes, ...config.enumNodes,
  ])
  for (const child of rootNode.namedChildren) {
    if (!definitionTypes.has(child.type)) continue
    const nameNode = child.childForFieldName('name')
    if (nameNode) {
      if (config.id === 'go' && !/^[A-Z]/.test(nameNode.text)) continue
      names.push(nameNode.text)
    }
  }
  return names
}

// ─── Definition building helpers ──────────────────────────────────────────────

export function isNodeExported(node: Parser.SyntaxNode, config: LanguageConfig): boolean {
  if (config.exportKeyword) return node.parent?.type === config.exportKeyword
  return resolveExportStatus(node, config)
}

export function isDefaultExport(node: Parser.SyntaxNode): boolean {
  const parent = node.parent
  if (!parent || parent.type !== 'export_statement') return false
  return parent.children.some((c) => c.type === 'default')
}

export function extractSingleDefinition(
  node: Parser.SyntaxNode,
  label: string,
  config: LanguageConfig,
): ExtractedDefinition | null {
  const nameNode = extractDefinitionNameNode(node)
  if (!nameNode) return null

  const name = nameNode.text
  let signature: string | null = null
  let returnType: string | null = null
  if (label === 'Function' || label === 'Method') {
    signature = extractNodeSignature(node)
    returnType = extractReturnType(node)
  }

  const decorators = collectDecorators(node)
  const isAsync = hasModifier(node, 'async')
  const isStatic = label === 'Method' && hasModifier(node, 'static')
  const isAbstract = node.type.includes('abstract') || hasModifier(node, 'abstract')

  let receiver: string | null = null
  if (label === 'Method') {
    const classNode = findAncestorOfType(node, config.classNodes)
    receiver = classNode?.childForFieldName('name')?.text ?? null
  }

  return {
    name,
    kind: label as NodeLabel,
    signature, returnType,
    startLine: node.startPosition.row + 1,
    endLine: node.endPosition.row + 1,
    isExported: isNodeExported(node, config),
    isDefault: isDefaultExport(node),
    isAsync, isStatic, isAbstract, decorators, receiver, constants: [],
  }
}

export function extractArrowDeclarator(
  node: Parser.SyntaxNode,
  declarator: Parser.SyntaxNode,
  existingNames: Set<string>,
  definitions: ExtractedDefinition[],
): void {
  if (declarator.type !== 'variable_declarator') return
  const nameNode = declarator.childForFieldName('name')
  const valueNode = declarator.childForFieldName('value')
  if (!nameNode || !valueNode || !isArrowOrFunctionValue(valueNode)) return
  const name = nameNode.text
  if (existingNames.has(name)) return
  existingNames.add(name)
  const isAsync = hasModifier(valueNode, 'async') || valueNode.text.startsWith('async')
  definitions.push({
    name, kind: 'Function',
    signature: extractNodeSignature(valueNode),
    returnType: extractReturnType(valueNode) ?? extractReturnTypeFromAnnotation(declarator),
    startLine: node.startPosition.row + 1, endLine: node.endPosition.row + 1,
    isExported: true, isDefault: isDefaultExport(node),
    isAsync, isStatic: false, isAbstract: false, decorators: [], receiver: null, constants: [],
  })
}

/** Collect exported identifier names from an export_statement node via walkFn. */
export function collectExportedIdentifiers(
  exportNode: Parser.SyntaxNode,
  walkFn: (node: Parser.SyntaxNode, cb: (n: Parser.SyntaxNode) => void) => void,
  names: Set<string>,
): void {
  walkFn(exportNode, (child) => {
    if (child.type !== 'identifier' && child.type !== 'type_identifier') return
    const parent = child.parent
    if (parent && parent.type !== 'import_clause' && parent.type !== 'string' && parent.type !== 'template_string') {
      names.add(child.text)
    }
  })
}
