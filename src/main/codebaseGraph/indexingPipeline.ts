/**
 * indexingPipeline.ts — Multi-pass project indexer.
 *
 * Walks a project directory, parses every supported source file with tree-sitter,
 * and populates the SQLite property graph with nodes and edges. Supports incremental
 * reindexing via stat-based fast path + SHA-256 content hash verification.
 *
 * Pass sequence:
 *   0. File Discovery   — walk directory, respect ignores, apply size/count caps
 *   1. Structure Pass   — Project, Folder, File nodes + containment edges
 *   2. Parse Pass       — tree-sitter parse all files -> ParsedFileResult[]
 *   3. Definition Pass  — Function/Class/Interface/Type/Enum/Method/Route nodes
 *   4. Import Pass      — resolve imports, create IMPORTS edges + Package nodes
 *   5. Call Resolution  — resolve call expressions, create CALLS/ASYNC_CALLS edges
 *   6. Finalize         — update file hashes + project stats
 */

import { createHash } from 'crypto'
import fs from 'fs/promises'
import path from 'path'
import ignore from 'ignore'

import { GraphDatabase } from './graphDatabase'
import { TreeSitterParser } from './treeSitterParser'
import { getLanguageConfig } from './treeSitterLanguageConfigs'
import { httpLinkPass } from './passes/httpLinkPass'
import { testDetectPass } from './passes/testDetectPass'
import { enrichmentPass } from './passes/enrichmentPass'
import { gitCoChangePass } from './passes/gitCoChangePass'
import type {
  GraphNode,
  GraphEdge,
  NodeLabel,
  EdgeType,
} from './graphDatabaseTypes'
import type { ExtractedDefinition } from './treeSitterTypes'
import type {
  IndexingOptions,
  IndexingResult,
  IndexingProgress,
  DiscoveredFile,
  IndexedFile,
} from './indexingPipelineTypes'

// ─── Hardcoded ignore patterns ────────────────────────────────────────────────

const ALWAYS_IGNORE_DIRS = new Set([
  'node_modules', '.git', '.svn', '.hg',
  'dist', 'build', 'out', '.next', '.nuxt',
  '.context', '__pycache__', '.mypy_cache', '.pytest_cache',
  'coverage', '.nyc_output', '.turbo', '.parcel-cache',
  'vendor', 'target',
  '.vscode', '.idea', '.fleet',
  'venv', '.venv', 'env', '.env',
  '.terraform', '.serverless',
])

const ALWAYS_IGNORE_FILES = new Set([
  '.DS_Store', 'Thumbs.db', 'desktop.ini',
  'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml',
  'bun.lockb', 'Cargo.lock', 'go.sum', 'Gemfile.lock',
  'composer.lock', 'poetry.lock',
])

const ALWAYS_IGNORE_EXTENSIONS = new Set([
  'map', 'min.js', 'min.css',
  'png', 'jpg', 'jpeg', 'gif', 'svg', 'ico', 'webp', 'bmp',
  'mp3', 'mp4', 'wav', 'avi', 'mov', 'mkv',
  'zip', 'tar', 'gz', 'bz2', 'xz', '7z', 'rar',
  'woff', 'woff2', 'ttf', 'eot', 'otf',
  'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
  'exe', 'dll', 'so', 'dylib', 'o', 'obj',
  'pyc', 'pyo', 'class',
  'db', 'sqlite', 'sqlite3',
  'wasm',
])

// ─── File Discovery (Pass 0) ─────────────────────────────────────────────────

async function discoverFiles(
  projectRoot: string,
  options: IndexingOptions,
): Promise<DiscoveredFile[]> {
  const maxSize = options.maxFileSize ?? 512 * 1024  // 512KB
  const maxFiles = options.maxFiles ?? 10000
  const files: DiscoveredFile[] = []
  const extraIgnores = options.ignorePaths ?? []

  // Load .gitignore
  const ig = ignore()
  try {
    const gitignoreContent = await fs.readFile(
      path.join(projectRoot, '.gitignore'), 'utf-8',
    )
    ig.add(gitignoreContent)
  } catch { /* no .gitignore */ }

  // Also load .cbmignore if present (codebase-memory-mcp compat)
  try {
    const cbmIgnore = await fs.readFile(
      path.join(projectRoot, '.cbmignore'), 'utf-8',
    )
    ig.add(cbmIgnore)
  } catch { /* no .cbmignore */ }

  if (extraIgnores.length > 0) {
    ig.add(extraIgnores)
  }

  async function walk(dir: string): Promise<void> {
    if (files.length >= maxFiles) return

    let entries: import('fs').Dirent[]
    try {
      entries = await fs.readdir(dir, { withFileTypes: true })
    } catch {
      return  // Permission denied or broken symlink
    }

    for (const entry of entries) {
      if (files.length >= maxFiles) return

      const fullPath = path.join(dir, entry.name)
      const relPath = path.relative(projectRoot, fullPath).replace(/\\/g, '/')

      if (entry.isDirectory()) {
        if (ALWAYS_IGNORE_DIRS.has(entry.name)) continue
        if (ig.ignores(relPath + '/')) continue
        await walk(fullPath)
        continue
      }

      if (!entry.isFile()) continue
      if (ALWAYS_IGNORE_FILES.has(entry.name)) continue

      const ext = path.extname(entry.name).slice(1).toLowerCase()
      if (ALWAYS_IGNORE_EXTENSIONS.has(ext)) continue
      if (ig.ignores(relPath)) continue

      try {
        const stat = await fs.stat(fullPath)
        if (stat.size > maxSize) continue
        if (stat.size === 0) continue

        files.push({
          absolutePath: fullPath,
          relativePath: relPath,
          extension: ext,
          sizeBytes: stat.size,
          mtimeMs: stat.mtimeMs,
        })
      } catch {
        // Stat failed, skip
      }
    }
  }

  await walk(projectRoot)
  return files
}

// ─── Content Hashing ──────────────────────────────────────────────────────────

async function hashFileContent(filePath: string): Promise<string> {
  const content = await fs.readFile(filePath)
  return createHash('sha256').update(content).digest('hex')
}

// ─── Incremental Reindex Logic ────────────────────────────────────────────────

async function filterChangedFiles(
  db: GraphDatabase,
  projectName: string,
  files: DiscoveredFile[],
): Promise<{ changed: DiscoveredFile[]; unchanged: string[] }> {
  const changed: DiscoveredFile[] = []
  const unchanged: string[] = []

  for (const file of files) {
    const existing = db.getFileHash(projectName, file.relativePath)

    // Fast path: stat hasn't changed -> skip content hash
    if (
      existing
      && existing.mtime_ns === Math.floor(file.mtimeMs * 1e6)
      && existing.size === file.sizeBytes
    ) {
      unchanged.push(file.relativePath)
      continue
    }

    // Stat changed — compute content hash
    const hash = await hashFileContent(file.absolutePath)
    if (existing && existing.content_hash === hash) {
      // Content identical despite stat change (e.g., touch)
      // Update stat in DB but don't reparse
      db.upsertFileHash({
        project: projectName,
        rel_path: file.relativePath,
        content_hash: hash,
        mtime_ns: Math.floor(file.mtimeMs * 1e6),
        size: file.sizeBytes,
      })
      unchanged.push(file.relativePath)
      continue
    }

    changed.push(file)
  }

  return { changed, unchanged }
}

// ─── Structure Pass (Pass 1) ─────────────────────────────────────────────────

function structurePass(
  db: GraphDatabase,
  projectName: string,
  projectRoot: string,
  files: DiscoveredFile[],
): void {
  // Create project node
  db.insertNode({
    id: projectName,
    project: projectName,
    label: 'Project',
    name: projectName,
    qualified_name: projectName,
    file_path: null,
    start_line: null,
    end_line: null,
    props: { name: projectName, root_path: projectRoot },
  })

  // Collect unique folders
  const folders = new Set<string>()
  for (const file of files) {
    const parts = file.relativePath.split('/')
    for (let i = 1; i < parts.length; i++) {
      folders.add(parts.slice(0, i).join('/'))
    }
  }

  // Create folder nodes
  const folderNodes: GraphNode[] = []
  for (const folderPath of folders) {
    const folderName = path.posix.basename(folderPath)
    const qn = `${projectName}.${folderPath.replace(/\//g, '.')}`

    folderNodes.push({
      id: qn,
      project: projectName,
      label: 'Folder',
      name: folderName,
      qualified_name: qn,
      file_path: folderPath,
      start_line: null,
      end_line: null,
      props: { name: folderName, path: folderPath },
    })
  }
  db.insertNodes(folderNodes)

  // Create folder containment edges (parent folder -> child folder)
  const folderEdges: Omit<GraphEdge, 'id'>[] = []
  for (const folderPath of folders) {
    const parentPath = path.posix.dirname(folderPath)
    const parentQn = parentPath === '.'
      ? projectName
      : `${projectName}.${parentPath.replace(/\//g, '.')}`
    const childQn = `${projectName}.${folderPath.replace(/\//g, '.')}`

    folderEdges.push({
      project: projectName,
      source_id: parentQn,
      target_id: childQn,
      type: 'CONTAINS_FOLDER',
      props: {},
    })
  }
  db.insertEdges(folderEdges)

  // Create file nodes
  const fileNodes: GraphNode[] = files.map((f) => {
    const qn = `${projectName}.${f.relativePath.replace(/\//g, '.').replace(/\.[^.]+$/, '')}`
    const langConfig = getLanguageConfig(f.extension)
    return {
      id: qn,
      project: projectName,
      label: 'File' as NodeLabel,
      name: path.posix.basename(f.relativePath),
      qualified_name: qn,
      file_path: f.relativePath,
      start_line: null,
      end_line: null,
      props: {
        name: path.posix.basename(f.relativePath),
        path: f.relativePath,
        language: langConfig?.id ?? 'unknown',
        line_count: 0,
        size_bytes: f.sizeBytes,
        content_hash: '',
      },
    }
  })
  db.insertNodes(fileNodes)

  // Create file containment edges (folder -> file)
  const fileEdges: Omit<GraphEdge, 'id'>[] = files.map((f) => {
    const folderPath = path.posix.dirname(f.relativePath)
    const parentQn = folderPath === '.'
      ? projectName
      : `${projectName}.${folderPath.replace(/\//g, '.')}`
    const fileQn = `${projectName}.${f.relativePath.replace(/\//g, '.').replace(/\.[^.]+$/, '')}`

    return {
      project: projectName,
      source_id: parentQn,
      target_id: fileQn,
      type: 'CONTAINS_FILE' as EdgeType,
      props: {},
    }
  })
  db.insertEdges(fileEdges)
}

// ─── Parse Pass (Pass 2) ─────────────────────────────────────────────────────

async function parsePass(
  parser: TreeSitterParser,
  files: DiscoveredFile[],
  onProgress?: (processed: number, total: number) => void,
): Promise<IndexedFile[]> {
  const results: IndexedFile[] = []

  for (let i = 0; i < files.length; i++) {
    const file = files[i]

    let content: string
    try {
      content = await fs.readFile(file.absolutePath, 'utf-8')
    } catch {
      results.push({ ...file, contentHash: '', parsed: null })
      continue
    }

    const contentHash = createHash('sha256').update(content).digest('hex')

    let parsed = null
    try {
      parsed = await parser.parseFile(file.relativePath, content)
    } catch {
      // Parse error — still record the file, just without parsed data
    }

    results.push({ ...file, contentHash, parsed })

    if (onProgress && (i % 50 === 0 || i === files.length - 1)) {
      onProgress(i + 1, files.length)
    }
  }

  return results
}

// ─── Entry Point Detection ────────────────────────────────────────────────────

function isEntryPoint(def: ExtractedDefinition, file: IndexedFile): boolean {
  // main functions
  if (def.name === 'main') return true

  // Decorated route handlers / framework entry points
  if (def.decorators.some((d) =>
    ['Get', 'Post', 'Put', 'Delete', 'Patch', 'Controller', 'Injectable',
      'Component', 'Module', 'Resolver', 'Middleware'].includes(d),
  )) return true

  // Test functions
  if (/\.(test|spec)\.[^.]+$/.test(file.relativePath)) return true

  // Default export from index files
  if (def.isDefault && /\/index\.[^.]+$/.test(file.relativePath)) return true

  return false
}

// ─── Definition Pass (Pass 3) ─────────────────────────────────────────────────

function definitionPass(
  db: GraphDatabase,
  projectName: string,
  indexedFiles: IndexedFile[],
): void {
  const nodes: GraphNode[] = []
  const edges: Omit<GraphEdge, 'id'>[] = []

  for (const file of indexedFiles) {
    if (!file.parsed) continue

    const fileQn = `${projectName}.${file.relativePath.replace(/\//g, '.').replace(/\.[^.]+$/, '')}`

    // Update file node with line count and content hash
    const existingFile = db.getNode(fileQn)
    if (existingFile) {
      existingFile.props.line_count = file.parsed.lineCount
      existingFile.props.content_hash = file.contentHash
      db.updateNodeProps(fileQn, existingFile.props)
    }

    for (const def of file.parsed.definitions) {
      const symbolQn = `${fileQn}.${def.name}`

      // Build properties based on kind
      const props: Record<string, unknown> = {
        name: def.name,
        is_exported: def.isExported,
      }

      if (def.signature) props.signature = def.signature
      if (def.returnType) props.return_type = def.returnType
      if (def.isAsync) props.is_async = true
      if (def.isStatic) props.is_static = true
      if (def.isAbstract) props.is_abstract = true
      if (def.decorators.length > 0) props.decorators = def.decorators
      if (def.receiver) props.receiver = def.receiver
      if (def.kind === 'Function' || def.kind === 'Method') {
        props.is_entry_point = isEntryPoint(def, file)
      }

      nodes.push({
        id: symbolQn,
        project: projectName,
        label: def.kind,
        name: def.name,
        qualified_name: symbolQn,
        file_path: file.relativePath,
        start_line: def.startLine,
        end_line: def.endLine,
        props,
      })

      // DEFINES edge: File -> Symbol
      edges.push({
        project: projectName,
        source_id: fileQn,
        target_id: symbolQn,
        type: 'DEFINES',
        props: {},
      })

      // DEFINES_METHOD edge: Class -> Method
      if (def.kind === 'Method' && def.receiver) {
        const classQn = `${fileQn}.${def.receiver}`
        edges.push({
          project: projectName,
          source_id: classQn,
          target_id: symbolQn,
          type: 'DEFINES_METHOD',
          props: {},
        })
      }
    }

    // Create Route nodes from extracted routes
    for (const route of file.parsed.routes) {
      const routeQn = `${fileQn}.__route_${route.method}_${route.path.replace(/[^a-zA-Z0-9]/g, '_')}`

      nodes.push({
        id: routeQn,
        project: projectName,
        label: 'Route',
        name: `${route.method} ${route.path}`,
        qualified_name: routeQn,
        file_path: file.relativePath,
        start_line: route.startLine,
        end_line: route.startLine,
        props: {
          name: `${route.method} ${route.path}`,
          method: route.method,
          path: route.path,
          handler: route.handlerName,
        },
      })

      // HANDLES edge: Route -> Handler function (if found)
      if (route.handlerName) {
        const handlerQn = `${fileQn}.${route.handlerName}`
        edges.push({
          project: projectName,
          source_id: routeQn,
          target_id: handlerQn,
          type: 'HANDLES',
          props: {},
        })
      }
    }
  }

  db.insertNodes(nodes)
  db.insertEdges(edges)
}

// ─── Import Pass (Pass 4) ─────────────────────────────────────────────────────

function importPass(
  db: GraphDatabase,
  projectName: string,
  _projectRoot: string,
  indexedFiles: IndexedFile[],
  allFiles?: DiscoveredFile[],
): void {
  const edges: Omit<GraphEdge, 'id'>[] = []

  // Build resolution map from ALL files (not just changed ones) so incremental
  // runs can resolve cross-file imports to unchanged files
  const resolutionFiles = allFiles ?? indexedFiles
  const fileQnMap = new Map<string, string>()
  for (const file of resolutionFiles) {
    const qn = `${projectName}.${file.relativePath.replace(/\//g, '.').replace(/\.[^.]+$/, '')}`
    // Store multiple variants for resolution
    fileQnMap.set(file.relativePath, qn)
    fileQnMap.set(file.relativePath.replace(/\.[^.]+$/, ''), qn)
    // Also store with /index stripped for barrel imports
    if (file.relativePath.match(/\/index\.[^.]+$/)) {
      fileQnMap.set(file.relativePath.replace(/\/index\.[^.]+$/, ''), qn)
    }
  }

  for (const file of indexedFiles) {
    if (!file.parsed) continue

    const sourceFileQn = `${projectName}.${file.relativePath.replace(/\//g, '.').replace(/\.[^.]+$/, '')}`
    const fileDir = path.posix.dirname(file.relativePath)

    for (const imp of file.parsed.imports) {
      let targetQn: string | null = null

      if (imp.source.startsWith('.')) {
        // Relative import — resolve against the importing file's directory
        const resolvedPath = path.posix.normalize(
          path.posix.join(fileDir, imp.source),
        )

        // Try with and without extensions
        targetQn = fileQnMap.get(resolvedPath)
          ?? fileQnMap.get(resolvedPath + '/index')
          ?? null

        // Try common extensions
        if (!targetQn) {
          for (const ext of ['ts', 'tsx', 'js', 'jsx', 'py', 'go', 'rs']) {
            targetQn = fileQnMap.get(resolvedPath + '.' + ext) ?? null
            if (targetQn) break
          }
        }
      } else {
        // Package/module import (non-relative)
        // Create a Package node if not exists
        const pkgName = imp.source.startsWith('@')
          ? imp.source.split('/').slice(0, 2).join('/')
          : imp.source.split('/')[0]

        const pkgQn = `${projectName}.__pkg_${pkgName.replace(/[^a-zA-Z0-9]/g, '_')}`

        // Check if package node exists, create if not
        if (!db.getNode(pkgQn)) {
          db.insertNode({
            id: pkgQn,
            project: projectName,
            label: 'Package',
            name: pkgName,
            qualified_name: pkgQn,
            file_path: null,
            start_line: null,
            end_line: null,
            props: { name: pkgName },
          })
        }

        targetQn = pkgQn
      }

      if (targetQn && targetQn !== sourceFileQn) {
        edges.push({
          project: projectName,
          source_id: sourceFileQn,
          target_id: targetQn,
          type: 'IMPORTS',
          props: {
            specifiers: imp.specifiers.map((s) => s.name),
            is_type_only: imp.isTypeOnly,
          },
        })
      }
    }
  }

  db.insertEdges(edges)
}

// ─── Call Resolution Pass (Pass 5) ────────────────────────────────────────────

function callResolutionPass(
  db: GraphDatabase,
  projectName: string,
  indexedFiles: IndexedFile[],
): void {
  const edges: Omit<GraphEdge, 'id'>[] = []

  // Build symbol lookup maps for resolution
  // Map: short name -> list of qualified names
  const symbolsByName = new Map<string, string[]>()
  const allDefinitions = db.getNodesByLabel(projectName, 'Function')
    .concat(db.getNodesByLabel(projectName, 'Method'))

  for (const node of allDefinitions) {
    const names = symbolsByName.get(node.name) ?? []
    names.push(node.id)
    symbolsByName.set(node.name, names)
  }

  // Build import-based resolution: for each file, map imported names -> source symbols
  const fileImportMap = new Map<string, Map<string, string>>()

  for (const file of indexedFiles) {
    if (!file.parsed) continue

    const importedNames = new Map<string, string>()
    const fileQn = `${projectName}.${file.relativePath.replace(/\//g, '.').replace(/\.[^.]+$/, '')}`

    for (const imp of file.parsed.imports) {
      if (imp.isTypeOnly) continue  // Type imports don't produce calls

      for (const spec of imp.specifiers) {
        // Try to resolve the specifier to a symbol in the target file
        const candidates = symbolsByName.get(spec.originalName ?? spec.name) ?? []
        if (candidates.length === 1) {
          importedNames.set(spec.name, candidates[0])
        } else if (candidates.length > 1) {
          // Disambiguate by import source if possible
          const fromFile = imp.source.replace(/^\.\//, '').replace(/\.[^.]+$/, '')
          const match = candidates.find((c) => c.includes(fromFile.replace(/\//g, '.')))
          if (match) {
            importedNames.set(spec.name, match)
          }
        }
      }
    }

    fileImportMap.set(fileQn, importedNames)
  }

  // Resolve calls
  for (const file of indexedFiles) {
    if (!file.parsed) continue

    const fileQn = `${projectName}.${file.relativePath.replace(/\//g, '.').replace(/\.[^.]+$/, '')}`
    const importedNames = fileImportMap.get(fileQn) ?? new Map()

    // Find which function each call is inside of (by line range)
    const fileDefs = file.parsed.definitions.filter(
      (d) => d.kind === 'Function' || d.kind === 'Method',
    )

    for (const call of file.parsed.calls) {
      // Find the enclosing function
      const enclosingDef = fileDefs.find(
        (d) => call.startLine >= d.startLine && call.startLine <= d.endLine,
      )
      if (!enclosingDef) continue  // Call at module level, skip

      const callerQn = `${fileQn}.${enclosingDef.name}`

      // Resolve callee
      let calleeQn: string | null = null

      // 1. Check imported names first
      if (importedNames.has(call.calleeName)) {
        calleeQn = importedNames.get(call.calleeName)!
      }

      // 2. Check same-file definitions
      if (!calleeQn) {
        const sameFileDef = fileDefs.find((d) => d.name === call.calleeName)
        if (sameFileDef) {
          calleeQn = `${fileQn}.${sameFileDef.name}`
        }
      }

      // 3. Check global symbol table (best effort)
      if (!calleeQn) {
        const candidates = symbolsByName.get(call.calleeName) ?? []
        if (candidates.length === 1) {
          calleeQn = candidates[0]
        }
      }

      if (calleeQn && calleeQn !== callerQn) {
        // Verify the target node exists
        if (db.getNode(calleeQn)) {
          edges.push({
            project: projectName,
            source_id: callerQn,
            target_id: calleeQn,
            type: call.isAsync ? 'ASYNC_CALLS' : 'CALLS',
            props: {},
          })
        }
      }
    }
  }

  // Deduplicate edges (same source -> target -> type)
  const seen = new Set<string>()
  const uniqueEdges = edges.filter((e) => {
    const key = `${e.source_id}|${e.target_id}|${e.type}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  db.insertEdges(uniqueEdges)
}

// ─── Pipeline Orchestrator ────────────────────────────────────────────────────

export class IndexingPipeline {
  private db: GraphDatabase
  private parser: TreeSitterParser

  constructor(db: GraphDatabase, parser: TreeSitterParser) {
    this.db = db
    this.parser = parser
  }

  async index(options: IndexingOptions): Promise<IndexingResult> {
    const startTime = Date.now()
    const errors: string[] = []
    let nodesCreated = 0
    let edgesCreated = 0

    const projectName = options.projectName
      ?? path.basename(options.projectRoot).toLowerCase().replace(/[^a-z0-9-]/g, '-')

    const isIncremental = options.incremental !== false
    const progress: IndexingProgress = {
      phase: 'discovery',
      filesTotal: 0,
      filesProcessed: 0,
      nodesCreated: 0,
      edgesCreated: 0,
      errors: [],
      startedAt: startTime,
      elapsedMs: 0,
    }

    const report = (phase: string): void => {
      progress.phase = phase
      progress.elapsedMs = Date.now() - startTime
      progress.nodesCreated = nodesCreated
      progress.edgesCreated = edgesCreated
      progress.errors = errors
      options.onProgress?.(progress)
    }

    try {
      // ── Pass 0: File Discovery ────────────────────────────────────────
      report('discovery')
      const allFiles = await discoverFiles(options.projectRoot, options)
      progress.filesTotal = allFiles.length

      // ── Incremental filtering ─────────────────────────────────────────
      let filesToProcess: DiscoveredFile[]
      let isIncrementalRun = false

      if (isIncremental && this.db.getProject(projectName)) {
        const { changed } = await filterChangedFiles(
          this.db, projectName, allFiles,
        )
        filesToProcess = changed
        isIncrementalRun = changed.length < allFiles.length

        if (isIncrementalRun) {
          // Delete old nodes/edges for changed files only
          for (const file of changed) {
            this.db.deleteNodesByFile(projectName, file.relativePath)
          }

          // Detect deleted files (in DB but not on disk)
          const diskPaths = new Set(allFiles.map((f) => f.relativePath))
          const dbHashes = this.db.getAllFileHashes(projectName)
          for (const hash of dbHashes) {
            if (!diskPaths.has(hash.rel_path)) {
              this.db.deleteNodesByFile(projectName, hash.rel_path)
              this.db.deleteFileHash(projectName, hash.rel_path)
            }
          }
        }
      } else {
        // Full reindex — clear everything for this project
        this.db.deleteProject(projectName)
        filesToProcess = allFiles
      }

      // ── Upsert project record ─────────────────────────────────────────
      this.db.upsertProject({
        name: projectName,
        root_path: options.projectRoot,
        indexed_at: Date.now(),
        node_count: 0,
        edge_count: 0,
      })

      // ── Pass 2: Parse (outside transaction — async I/O) ────────────────
      report('parsing')
      const indexedFiles = await parsePass(
        this.parser, filesToProcess, (processed, total) => {
          progress.filesProcessed = processed
          report('parsing')
        },
      )

      // ── All remaining passes run inside a transaction for atomicity ────
      this.db.transaction(() => {
        // ── Pass 1: Structure ─────────────────────────────────────────────
        report('structure')
        if (!isIncrementalRun) {
          structurePass(this.db, projectName, options.projectRoot, allFiles)
        } else {
          // Add structure for new/changed files only (INSERT OR REPLACE handles dupes)
          structurePass(this.db, projectName, options.projectRoot, filesToProcess)
        }

        // ── Pass 3: Definitions ───────────────────────────────────────────
        report('definitions')
        definitionPass(this.db, projectName, indexedFiles)

        // ── Pass 4: Imports ───────────────────────────────────────────────
        // Use allFiles for resolution map so incremental runs can resolve cross-file imports
        report('imports')
        importPass(this.db, projectName, options.projectRoot, indexedFiles, allFiles)

        // ── Pass 5: Call resolution ───────────────────────────────────────
        report('calls')
        callResolutionPass(this.db, projectName, indexedFiles)

        // ── Pass 6: HTTP link matching ─────────────────────────────────────
        report('http_links')
        httpLinkPass(this.db, projectName, indexedFiles)

        // ── Pass 7: Test detection ─────────────────────────────────────────
        report('test_detection')
        testDetectPass(this.db, projectName, indexedFiles)

        // ── Pass 8: Enrichment (entry points, implements) ──────────────────
        report('enrichment')
        enrichmentPass(this.db, projectName, indexedFiles)

        // ── Pass 9: Git co-change analysis ─────────────────────────────────
        report('git_history')
        gitCoChangePass(this.db, projectName, options.projectRoot)
      })

      // ── Finalize ───────────────────────────────────────────────────────
      report('finalizing')
      for (const file of indexedFiles) {
        this.db.upsertFileHash({
          project: projectName,
          rel_path: file.relativePath,
          content_hash: file.contentHash,
          mtime_ns: Math.floor(file.mtimeMs * 1e6),
          size: file.sizeBytes,
        })
      }

      // Update project stats
      nodesCreated = this.db.getNodeCount(projectName)
      edgesCreated = this.db.getEdgeCount(projectName)
      this.db.upsertProject({
        name: projectName,
        root_path: options.projectRoot,
        indexed_at: Date.now(),
        node_count: nodesCreated,
        edge_count: edgesCreated,
      })

      return {
        projectName,
        success: true,
        filesIndexed: indexedFiles.length,
        filesSkipped: allFiles.length - filesToProcess.length,
        nodesCreated,
        edgesCreated,
        errors,
        durationMs: Date.now() - startTime,
        incremental: isIncrementalRun,
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err)
      errors.push(errMsg)
      return {
        projectName,
        success: false,
        filesIndexed: 0,
        filesSkipped: 0,
        nodesCreated,
        edgesCreated,
        errors,
        durationMs: Date.now() - startTime,
        incremental: false,
      }
    }
  }
}
