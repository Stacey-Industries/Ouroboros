/**
 * indexingPipelinePasses.ts — Pass functions extracted from indexingPipeline.ts
 * to keep the main orchestrator under the 300-line limit.
 *
 * Contains: Structure Pass (1), Parse Pass (2), Definition Pass (3), Import Pass (4).
 */

import { createHash } from 'crypto'
import fs from 'fs/promises'
import path from 'path'

import type { GraphDatabase } from './graphDatabase'
import type { GraphEdge, GraphNode } from './graphDatabaseTypes'
import {
  buildDefProps,
  buildFileEdges,
  buildFileNodes,
  buildFileQnMap,
  buildFolderEdges,
  buildFolderNodes,
  getOrCreatePackageNode,
  resolveRelativeImport,
} from './indexingPipelineSupport'
import type { DiscoveredFile, IndexedFile } from './indexingPipelineTypes'
import type { TreeSitterParser } from './treeSitterParser'

// ─── Structure Pass (Pass 1) ─────────────────────────────────────────────────

export function structurePass(
  db: GraphDatabase,
  projectName: string,
  projectRoot: string,
  files: DiscoveredFile[],
): void {
  db.insertNode({
    id: projectName, project: projectName, label: 'Project', name: projectName,
    qualified_name: projectName, file_path: null, start_line: null, end_line: null,
    props: { name: projectName, root_path: projectRoot },
  })

  db.insertNodes(buildFolderNodes(projectName, files))
  db.insertEdges(buildFolderEdges(projectName, files))
  db.insertNodes(buildFileNodes(projectName, files))
  db.insertEdges(buildFileEdges(projectName, files))
}

// ─── Parse Pass (Pass 2) ─────────────────────────────────────────────────────

export async function parsePass(
  parser: TreeSitterParser,
  files: DiscoveredFile[],
  onProgress?: (processed: number, total: number) => void,
): Promise<IndexedFile[]> {
  const results: IndexedFile[] = []
  let processed = 0

  for (const file of files) {
    let content: string
    try {
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- path from trusted discovery
      content = await fs.readFile(file.absolutePath, 'utf-8')
    } catch {
      results.push({ ...file, contentHash: '', parsed: null })
      processed++
      continue
    }

    const contentHash = createHash('sha256').update(content).digest('hex')
    let parsed = null
    try { parsed = await parser.parseFile(file.relativePath, content) } catch { /* skip */ }

    results.push({ ...file, contentHash, parsed })
    processed++
    if (onProgress && (processed % 50 === 0 || processed === files.length)) {
      onProgress(processed, files.length)
    }
  }

  return results
}

// ─── Definition Pass (Pass 3) ─────────────────────────────────────────────────

type NodeAccumulator = { nodes: GraphNode[]; edges: Omit<GraphEdge, 'id'>[]; projectName: string }

function updateFileProps(db: GraphDatabase, fileQn: string, file: IndexedFile): void {
  const existingFile = db.getNode(fileQn)
  if (!existingFile || !file.parsed) return
  existingFile.props.line_count = file.parsed.lineCount
  existingFile.props.content_hash = file.contentHash
  db.updateNodeProps(fileQn, existingFile.props)
}

function collectDefinitions(file: IndexedFile, fileQn: string, acc: NodeAccumulator): void {
  if (!file.parsed) return
  for (const def of file.parsed.definitions) {
    const symbolQn = `${fileQn}.${def.name}`
    acc.nodes.push({
      id: symbolQn, project: acc.projectName, label: def.kind,
      name: def.name, qualified_name: symbolQn,
      file_path: file.relativePath, start_line: def.startLine, end_line: def.endLine,
      props: buildDefProps(def, file),
    })
    acc.edges.push({ project: acc.projectName, source_id: fileQn, target_id: symbolQn, type: 'DEFINES', props: {} })
    if (def.kind === 'Method' && def.receiver) {
      const classQn = `${fileQn}.${def.receiver}`
      acc.edges.push({ project: acc.projectName, source_id: classQn, target_id: symbolQn, type: 'DEFINES_METHOD', props: {} })
    }
  }
}

function addRouteNodes(file: IndexedFile, fileQn: string, acc: NodeAccumulator): void {
  if (!file.parsed) return
  const { nodes, edges, projectName } = acc
  for (const route of file.parsed.routes) {
    const routeQn = `${fileQn}.__route_${route.method}_${route.path.replace(/[^a-zA-Z0-9]/g, '_')}`
    nodes.push({
      id: routeQn, project: projectName, label: 'Route',
      name: `${route.method} ${route.path}`, qualified_name: routeQn,
      file_path: file.relativePath, start_line: route.startLine, end_line: route.startLine,
      props: { name: `${route.method} ${route.path}`, method: route.method, path: route.path, handler: route.handlerName },
    })
    if (route.handlerName) {
      edges.push({ project: projectName, source_id: routeQn, target_id: `${fileQn}.${route.handlerName}`, type: 'HANDLES', props: {} })
    }
  }
}

export function definitionPass(
  db: GraphDatabase,
  projectName: string,
  indexedFiles: IndexedFile[],
): void {
  const acc: NodeAccumulator = { nodes: [], edges: [], projectName }

  for (const file of indexedFiles) {
    if (!file.parsed) continue
    const fileQn = `${projectName}.${file.relativePath.replace(/\//g, '.').replace(/\.[^.]+$/, '')}`
    updateFileProps(db, fileQn, file)
    collectDefinitions(file, fileQn, acc)
    addRouteNodes(file, fileQn, acc)
  }

  db.insertNodes(acc.nodes)
  db.insertEdges(acc.edges)
}

// ─── Import Pass (Pass 4) ─────────────────────────────────────────────────────

export function importPass(
  db: GraphDatabase,
  projectName: string,
  indexedFiles: IndexedFile[],
  allFiles?: DiscoveredFile[],
): void {
  const edges: Omit<GraphEdge, 'id'>[] = []
  const fileQnMap = buildFileQnMap(projectName, allFiles ?? indexedFiles)

  for (const file of indexedFiles) {
    if (!file.parsed) continue
    const sourceFileQn = `${projectName}.${file.relativePath.replace(/\//g, '.').replace(/\.[^.]+$/, '')}`
    const fileDir = path.posix.dirname(file.relativePath)

    for (const imp of file.parsed.imports) {
      const targetQn: string | null = imp.source.startsWith('.')
        ? resolveRelativeImport(imp.source, fileDir, fileQnMap)
        : getOrCreatePackageNode(db, projectName, imp.source)

      if (targetQn && targetQn !== sourceFileQn) {
        edges.push({
          project: projectName, source_id: sourceFileQn, target_id: targetQn,
          type: 'IMPORTS',
          props: { specifiers: imp.specifiers.map((s) => s.name), is_type_only: imp.isTypeOnly },
        })
      }
    }
  }

  db.insertEdges(edges)
}
