/**
 * graphParser.ts — Regex-based TypeScript/JS parser for symbol extraction.
 * No external dependencies — fast and dependency-free.
 */

import fs from 'fs/promises'
import path from 'path'
import type { GraphNode, GraphEdge } from './graphTypes'

interface ParseResult {
  nodes: GraphNode[]
  edges: GraphEdge[]
}

const PARSEABLE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx'])
const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', '.git', '.ouroboros'])
const MAX_FILE_SIZE = 500 * 1024 // 500KB

function makeNodeId(filePath: string, name: string, type: string, line: number): string {
  return `${filePath}::${name}::${type}::${line}`
}

/**
 * Resolve an import specifier to a file path relative to the project.
 * Returns the relative path (without extension normalization for simplicity).
 */
function resolveImportPath(importSpec: string, currentFile: string, projectRoot: string): string | null {
  if (!importSpec.startsWith('.')) {
    // External package import — skip
    return null
  }
  const dir = path.dirname(currentFile)
  let resolved = path.resolve(dir, importSpec)
  // Normalize to forward slashes and make relative to project root
  resolved = path.relative(projectRoot, resolved).replace(/\\/g, '/')
  return resolved
}

/**
 * Try to find the actual file for an import path (check extensions).
 */
function findImportTarget(importRelPath: string, fileSet: Set<string>): string | null {
  // Direct match
  if (fileSet.has(importRelPath)) return importRelPath
  // Try adding extensions
  for (const ext of ['.ts', '.tsx', '.js', '.jsx']) {
    if (fileSet.has(importRelPath + ext)) return importRelPath + ext
  }
  // Try /index
  for (const ext of ['.ts', '.tsx', '.js', '.jsx']) {
    const indexPath = importRelPath + '/index' + ext
    if (fileSet.has(indexPath)) return indexPath
  }
  return null
}

export async function parseFile(filePath: string, projectRoot: string): Promise<ParseResult> {
  const nodes: GraphNode[] = []
  const edges: GraphEdge[] = []

  const relPath = path.relative(projectRoot, filePath).replace(/\\/g, '/')

  let content: string
  try {
    content = await fs.readFile(filePath, 'utf-8')
  } catch {
    return { nodes, edges }
  }

  const lines = content.split('\n')

  // File-level node
  const fileNodeId = makeNodeId(relPath, path.basename(relPath), 'file', 0)
  nodes.push({
    id: fileNodeId,
    type: 'file',
    name: path.basename(relPath),
    filePath: relPath,
    line: 0,
  })

  // --- Function declarations ---
  // export async function name(
  // export function name(
  // function name(
  const funcDeclRe = /^(?:export\s+)?(?:async\s+)?function\s+(\w+)/gm
  let match: RegExpExecArray | null
  while ((match = funcDeclRe.exec(content)) !== null) {
    const name = match[1]
    const line = content.substring(0, match.index).split('\n').length
    const nodeId = makeNodeId(relPath, name, 'function', line)
    nodes.push({ id: nodeId, type: 'function', name, filePath: relPath, line })
    edges.push({ source: fileNodeId, target: nodeId, type: 'contains' })
    if (match[0].startsWith('export')) {
      edges.push({ source: fileNodeId, target: nodeId, type: 'exports' })
    }
  }

  // --- Arrow function assignments ---
  // export const name = (
  // export const name = async (
  // const name = (
  // const name = async (
  const arrowFuncRe = /^(?:export\s+)?(?:const|let|var)\s+(\w+)\s*(?::\s*[^=]+?)?\s*=\s*(?:async\s+)?\(/gm
  while ((match = arrowFuncRe.exec(content)) !== null) {
    const name = match[1]
    const line = content.substring(0, match.index).split('\n').length
    const nodeId = makeNodeId(relPath, name, 'function', line)
    // Avoid duplicates if already captured
    if (!nodes.some((n) => n.id === nodeId)) {
      nodes.push({ id: nodeId, type: 'function', name, filePath: relPath, line })
      edges.push({ source: fileNodeId, target: nodeId, type: 'contains' })
      if (match[0].startsWith('export')) {
        edges.push({ source: fileNodeId, target: nodeId, type: 'exports' })
      }
    }
  }

  // --- Arrow function with type annotation (no parens matched above) ---
  // export const name: Type = async (
  const arrowFuncTypedRe = /^(?:export\s+)?(?:const|let|var)\s+(\w+)\s*:\s*\S+\s*=\s*(?:async\s+)?\(/gm
  while ((match = arrowFuncTypedRe.exec(content)) !== null) {
    const name = match[1]
    const line = content.substring(0, match.index).split('\n').length
    const nodeId = makeNodeId(relPath, name, 'function', line)
    if (!nodes.some((n) => n.id === nodeId)) {
      nodes.push({ id: nodeId, type: 'function', name, filePath: relPath, line })
      edges.push({ source: fileNodeId, target: nodeId, type: 'contains' })
      if (match[0].startsWith('export')) {
        edges.push({ source: fileNodeId, target: nodeId, type: 'exports' })
      }
    }
  }

  // --- Classes ---
  const classRe = /^(?:export\s+)?(?:abstract\s+)?class\s+(\w+)(?:\s+extends\s+(\w+))?(?:\s+implements\s+([\w,\s]+))?/gm
  while ((match = classRe.exec(content)) !== null) {
    const name = match[1]
    const extendsName = match[2]
    const implementsRaw = match[3]
    const line = content.substring(0, match.index).split('\n').length
    const nodeId = makeNodeId(relPath, name, 'class', line)
    nodes.push({ id: nodeId, type: 'class', name, filePath: relPath, line })
    edges.push({ source: fileNodeId, target: nodeId, type: 'contains' })
    if (match[0].startsWith('export')) {
      edges.push({ source: fileNodeId, target: nodeId, type: 'exports' })
    }
    if (extendsName) {
      edges.push({ source: nodeId, target: `__unresolved::${extendsName}::class`, type: 'extends' })
    }
    if (implementsRaw) {
      const implementsList = implementsRaw.split(',').map((s) => s.trim()).filter(Boolean)
      for (const impl of implementsList) {
        edges.push({ source: nodeId, target: `__unresolved::${impl}::interface`, type: 'implements' })
      }
    }
  }

  // --- Class methods ---
  const methodRe = /^\s+(?:(?:public|private|protected|static|async|readonly)\s+)*(\w+)\s*\(/gm
  // Only capture methods inside class blocks — simplistic approach
  const classBlockRe = /^(?:export\s+)?(?:abstract\s+)?class\s+\w+[^{]*\{/gm
  while ((match = classBlockRe.exec(content)) !== null) {
    const classStart = match.index + match[0].length
    const classLine = content.substring(0, match.index).split('\n').length
    // Find closing brace (simplistic — count braces)
    let depth = 1
    let pos = classStart
    while (pos < content.length && depth > 0) {
      if (content[pos] === '{') depth++
      else if (content[pos] === '}') depth--
      pos++
    }
    const classBody = content.substring(classStart, pos)
    const methodBodyRe = /^\s+(?:(?:public|private|protected|static|async|readonly|override|get|set)\s+)*(\w+)\s*\(/gm
    let methodMatch: RegExpExecArray | null
    while ((methodMatch = methodBodyRe.exec(classBody)) !== null) {
      const methodName = methodMatch[1]
      // Skip constructor, common keywords
      if (['constructor', 'if', 'for', 'while', 'switch', 'catch', 'return', 'new', 'throw'].includes(methodName)) continue
      const methodLine = classLine + classBody.substring(0, methodMatch.index).split('\n').length - 1
      const nodeId = makeNodeId(relPath, methodName, 'function', methodLine)
      if (!nodes.some((n) => n.id === nodeId)) {
        nodes.push({ id: nodeId, type: 'function', name: methodName, filePath: relPath, line: methodLine })
        edges.push({ source: fileNodeId, target: nodeId, type: 'contains' })
      }
    }
  }

  // --- Interfaces ---
  const interfaceRe = /^(?:export\s+)?interface\s+(\w+)/gm
  while ((match = interfaceRe.exec(content)) !== null) {
    const name = match[1]
    const line = content.substring(0, match.index).split('\n').length
    const nodeId = makeNodeId(relPath, name, 'interface', line)
    nodes.push({ id: nodeId, type: 'interface', name, filePath: relPath, line })
    edges.push({ source: fileNodeId, target: nodeId, type: 'contains' })
    if (match[0].startsWith('export')) {
      edges.push({ source: fileNodeId, target: nodeId, type: 'exports' })
    }
  }

  // --- Type aliases ---
  const typeRe = /^(?:export\s+)?type\s+(\w+)\s*(?:<[^>]*>)?\s*=/gm
  while ((match = typeRe.exec(content)) !== null) {
    const name = match[1]
    const line = content.substring(0, match.index).split('\n').length
    const nodeId = makeNodeId(relPath, name, 'type_alias', line)
    nodes.push({ id: nodeId, type: 'type_alias', name, filePath: relPath, line })
    edges.push({ source: fileNodeId, target: nodeId, type: 'contains' })
    if (match[0].startsWith('export')) {
      edges.push({ source: fileNodeId, target: nodeId, type: 'exports' })
    }
  }

  // --- Imports ---
  const importRe = /^import\s+(?:type\s+)?(?:\{[^}]+\}|(\w+)|\*\s+as\s+(\w+)).*from\s+['"]([^'"]+)['"]/gm
  while ((match = importRe.exec(content)) !== null) {
    const importSpec = match[3]
    const line = content.substring(0, match.index).split('\n').length
    const resolved = resolveImportPath(importSpec, filePath, projectRoot)
    if (resolved) {
      // Edge from this file to the imported file (resolved later)
      edges.push({
        source: fileNodeId,
        target: `__file::${resolved}`,
        type: 'imports',
      })
    }
  }

  // --- Export default ---
  const exportDefaultRe = /^export\s+default\s+(?:class|function|abstract\s+class)\s+(\w+)/gm
  while ((match = exportDefaultRe.exec(content)) !== null) {
    const name = match[1]
    const line = content.substring(0, match.index).split('\n').length
    // The symbol node should already exist; just add export edge if missing
    const existing = nodes.find((n) => n.name === name && n.filePath === relPath)
    if (existing) {
      const hasExportEdge = edges.some(
        (e) => e.source === fileNodeId && e.target === existing.id && e.type === 'exports'
      )
      if (!hasExportEdge) {
        edges.push({ source: fileNodeId, target: existing.id, type: 'exports' })
      }
    }
  }

  // --- Re-exports: export { ... } from '...' ---
  const reExportRe = /^export\s+\{[^}]*\}\s*from\s+['"]([^'"]+)['"]/gm
  while ((match = reExportRe.exec(content)) !== null) {
    const importSpec = match[1]
    const resolved = resolveImportPath(importSpec, filePath, projectRoot)
    if (resolved) {
      edges.push({
        source: fileNodeId,
        target: `__file::${resolved}`,
        type: 'imports',
      })
    }
  }

  return { nodes, edges }
}

/**
 * Walk a directory recursively, yielding file paths for parseable files.
 */
export async function walkDirectory(dir: string, projectRoot: string): Promise<string[]> {
  const results: string[] = []

  async function walk(currentDir: string): Promise<void> {
    let entries: import('fs').Dirent[]
    try {
      entries = await fs.readdir(currentDir, { withFileTypes: true })
    } catch {
      return
    }

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name)

      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) {
          await walk(fullPath)
        }
        continue
      }

      if (!entry.isFile()) continue

      const ext = path.extname(entry.name)
      if (!PARSEABLE_EXTENSIONS.has(ext)) continue

      // Check file size
      try {
        const stat = await fs.stat(fullPath)
        if (stat.size > MAX_FILE_SIZE) continue
      } catch {
        continue
      }

      results.push(fullPath)
    }
  }

  await walk(dir)
  return results
}

/**
 * Resolve __file:: references in edges to actual file node IDs.
 * Also resolve __unresolved:: references for extends/implements.
 */
export function resolveEdgeReferences(
  allNodes: GraphNode[],
  allEdges: GraphEdge[]
): GraphEdge[] {
  // Build lookup maps
  const fileNodeIdByRelPath = new Map<string, string>()
  const nodesByName = new Map<string, GraphNode[]>()

  for (const node of allNodes) {
    if (node.type === 'file') {
      // Map multiple possible keys for the file
      const base = node.filePath
      fileNodeIdByRelPath.set(base, node.id)
      // Also strip extension
      const noExt = base.replace(/\.\w+$/, '')
      fileNodeIdByRelPath.set(noExt, node.id)
      // Also strip /index
      const noIndex = noExt.replace(/\/index$/, '')
      if (noIndex !== noExt) {
        fileNodeIdByRelPath.set(noIndex, node.id)
      }
    }
    // Build name lookup for class/interface resolution
    const existing = nodesByName.get(node.name) ?? []
    existing.push(node)
    nodesByName.set(node.name, existing)
  }

  return allEdges.map((edge) => {
    // Resolve __file:: targets
    if (edge.target.startsWith('__file::')) {
      const relPath = edge.target.substring('__file::'.length)
      const resolved = fileNodeIdByRelPath.get(relPath)
      if (resolved) {
        return { ...edge, target: resolved }
      }
      // Try with forward slashes normalized
      const normalized = relPath.replace(/\\/g, '/')
      const resolvedNorm = fileNodeIdByRelPath.get(normalized)
      if (resolvedNorm) {
        return { ...edge, target: resolvedNorm }
      }
      // Unresolvable — keep as-is (will be a dangling edge)
      return edge
    }

    // Resolve __unresolved:: targets for extends/implements
    if (edge.target.startsWith('__unresolved::')) {
      const parts = edge.target.substring('__unresolved::'.length).split('::')
      const name = parts[0]
      const candidates = nodesByName.get(name)
      if (candidates && candidates.length > 0) {
        // Prefer matching type (class for extends, interface for implements)
        const preferredType = parts[1] ?? 'class'
        const best = candidates.find((c) => c.type === preferredType) ?? candidates[0]
        return { ...edge, target: best.id }
      }
      return edge
    }

    return edge
  })
}
