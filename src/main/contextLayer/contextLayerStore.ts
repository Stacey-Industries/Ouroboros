import fs from 'fs/promises'
import path from 'path'

import log from '../logger'
import type { ContextLayerManifest, ModuleContextEntry, RepoMap } from './contextLayerTypes'

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------

function contextDir(workspaceRoot: string): string {
  return path.join(workspaceRoot, '.context')
}

function modulesDir(workspaceRoot: string): string {
  return path.join(workspaceRoot, '.context', 'modules')
}

function repoMapPath(workspaceRoot: string): string {
  return path.join(workspaceRoot, '.context', 'repo-map.json')
}

function manifestPath(workspaceRoot: string): string {
  return path.join(workspaceRoot, '.context', 'manifest.json')
}

function moduleEntryPath(workspaceRoot: string, moduleId: string): string {
  return path.join(modulesDir(workspaceRoot), `${sanitizeModuleId(moduleId)}.json`)
}

// ---------------------------------------------------------------------------
// Module ID sanitization
// ---------------------------------------------------------------------------

function sanitizeModuleId(moduleId: string): string {
  const sanitized = moduleId
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
  return sanitized.slice(0, 60) || 'unnamed'
}

// ---------------------------------------------------------------------------
// Write mutex — serializes writes to the same file path
// ---------------------------------------------------------------------------

const writeLocks = new Map<string, Promise<void>>()

async function withWriteLock(key: string, fn: () => Promise<void>): Promise<void> {
  const previous = writeLocks.get(key) ?? Promise.resolve()
  const next = previous.then(fn, fn)
  writeLocks.set(key, next)
  await next
}

// ---------------------------------------------------------------------------
// Atomic write — write .tmp then rename
// ---------------------------------------------------------------------------

async function atomicWriteJson(filePath: string, data: unknown): Promise<void> {
  const tmpPath = `${filePath}.tmp`
  const content = JSON.stringify(data, null, 2)
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- path built from validated workspace root + sanitized IDs
  await fs.writeFile(tmpPath, content, 'utf-8')
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- path built from validated workspace root + sanitized IDs
    await fs.rename(tmpPath, filePath)
  } catch (renameError) {
    try {
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- cleanup of tmp file built from the same validated path
      await fs.unlink(tmpPath)
    } catch {
      // Best effort cleanup — ignore if .tmp is already gone
    }
    log.warn('[context-layer] Atomic rename failed, .tmp cleaned up:', filePath, renameError)
    throw renameError
  }
}

// ---------------------------------------------------------------------------
// Safe JSON read — returns null if missing or corrupt
// ---------------------------------------------------------------------------

async function readJsonSafe<T>(filePath: string): Promise<T | null> {
  let raw: string
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- path built from validated workspace root + sanitized IDs
    raw = await fs.readFile(filePath, 'utf-8')
  } catch (error: unknown) {
    if (isFileNotFoundError(error)) {
      return null
    }
    log.warn('[context-layer] Failed to read file:', filePath, error)
    return null
  }

  try {
    return JSON.parse(raw) as T
  } catch {
    log.warn('[context-layer] Corrupt JSON — deleting:', filePath)
    try {
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- deleting a corrupt file at a known store path
      await fs.unlink(filePath)
    } catch {
      // Ignore if delete also fails
    }
    return null
  }
}

function isFileNotFoundError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as NodeJS.ErrnoException).code === 'ENOENT'
}

// ---------------------------------------------------------------------------
// Empty manifest factory
// ---------------------------------------------------------------------------

function createEmptyManifest(): ContextLayerManifest {
  return {
    version: 1,
    lastFullRebuild: 0,
    lastIncrementalUpdate: 0,
    repoMapHash: '',
    moduleHashes: {},
    totalSizeBytes: 0,
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Initialize store — create .context/ if missing, load manifest */
export async function initContextLayerStore(workspaceRoot: string): Promise<ContextLayerManifest> {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- path derived from validated workspace root
  await fs.mkdir(contextDir(workspaceRoot), { recursive: true })
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- path derived from validated workspace root
  await fs.mkdir(modulesDir(workspaceRoot), { recursive: true })

  const existing = await readManifest(workspaceRoot)
  if (existing) {
    return existing
  }

  const manifest = createEmptyManifest()
  await writeManifest(workspaceRoot, manifest)
  return manifest
}

/** Write repo map atomically (write .tmp, rename) */
export async function writeRepoMap(workspaceRoot: string, repoMap: RepoMap): Promise<void> {
  const filePath = repoMapPath(workspaceRoot)
  await withWriteLock(filePath, () => atomicWriteJson(filePath, repoMap))
}

/** Read repo map — returns null if missing or corrupt */
export async function readRepoMap(workspaceRoot: string): Promise<RepoMap | null> {
  return readJsonSafe<RepoMap>(repoMapPath(workspaceRoot))
}

/** Write a single module entry atomically */
export async function writeModuleEntry(workspaceRoot: string, moduleId: string, entry: ModuleContextEntry): Promise<void> {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- path derived from validated workspace root
  await fs.mkdir(modulesDir(workspaceRoot), { recursive: true })
  const filePath = moduleEntryPath(workspaceRoot, moduleId)
  await withWriteLock(filePath, () => atomicWriteJson(filePath, entry))
}

/** Read a single module entry — returns null if missing or corrupt */
export async function readModuleEntry(workspaceRoot: string, moduleId: string): Promise<ModuleContextEntry | null> {
  return readJsonSafe<ModuleContextEntry>(moduleEntryPath(workspaceRoot, moduleId))
}

/** Read all module entries */
export async function readAllModuleEntries(workspaceRoot: string): Promise<ModuleContextEntry[]> {
  const dir = modulesDir(workspaceRoot)
  let entries: string[]
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- path derived from validated workspace root
    entries = await fs.readdir(dir)
  } catch {
    return []
  }

  const results: ModuleContextEntry[] = []
  for (const entry of entries) {
    if (!entry.endsWith('.json') || entry.endsWith('.tmp')) {
      continue
    }
    const filePath = path.join(dir, entry)
    const parsed = await readJsonSafe<ModuleContextEntry>(filePath)
    if (parsed) {
      results.push(parsed)
    }
  }
  return results
}

/** Delete a module entry */
export async function deleteModuleEntry(workspaceRoot: string, moduleId: string): Promise<void> {
  const filePath = moduleEntryPath(workspaceRoot, moduleId)
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- path derived from validated workspace root + sanitized moduleId
    await fs.unlink(filePath)
  } catch (error: unknown) {
    if (!isFileNotFoundError(error)) {
      log.warn('[context-layer] Failed to delete module entry:', filePath, error)
    }
  }
}

/** Write manifest atomically */
export async function writeManifest(workspaceRoot: string, manifest: ContextLayerManifest): Promise<void> {
  const filePath = manifestPath(workspaceRoot)
  await withWriteLock(filePath, () => atomicWriteJson(filePath, manifest))
}

/** Read manifest — returns null if missing or corrupt */
export async function readManifest(workspaceRoot: string): Promise<ContextLayerManifest | null> {
  return readJsonSafe<ContextLayerManifest>(manifestPath(workspaceRoot))
}

// ---------------------------------------------------------------------------
// enforceSizeCap helpers
// ---------------------------------------------------------------------------

interface FileEntry {
  filePath: string
  size: number
  isModule: boolean
  moduleId: string | null
  lastModified: number
}

async function statFileSafe(filePath: string): Promise<{ size: number; isFile: boolean; mtimeMs: number } | null> {
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- path is always built from a validated context/modules dir
    const stat = await fs.stat(filePath)
    return { size: stat.size, isFile: stat.isFile(), mtimeMs: stat.mtimeMs }
  } catch {
    return null
  }
}

async function readTopLevelEntries(ctxDir: string): Promise<FileEntry[] | null> {
  const entries: FileEntry[] = []
  let names: string[]
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- path derived from validated workspace root
    names = await fs.readdir(ctxDir)
  } catch {
    return null // .context/ doesn't exist
  }
  for (const name of names) {
    if (name === 'modules') continue
    const filePath = path.join(ctxDir, name)
    const stat = await statFileSafe(filePath)
    if (stat?.isFile) {
      entries.push({ filePath, size: stat.size, isModule: false, moduleId: null, lastModified: stat.mtimeMs })
    }
  }
  return entries
}

async function readModuleFileEntry(filePath: string, name: string): Promise<FileEntry | null> {
  const stat = await statFileSafe(filePath)
  if (!stat?.isFile) return null
  const entry = await readJsonSafe<ModuleContextEntry>(filePath)
  const structuralLastModified = entry?.structural?.lastModified ?? 0
  return {
    filePath,
    size: stat.size,
    isModule: true,
    moduleId: name.replace(/\.json$/, ''),
    lastModified: structuralLastModified || stat.mtimeMs,
  }
}

async function readModuleDirEntries(modDir: string): Promise<FileEntry[]> {
  const entries: FileEntry[] = []
  let names: string[]
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- path derived from validated workspace root
    names = await fs.readdir(modDir)
  } catch {
    return entries
  }
  for (const name of names) {
    if (!name.endsWith('.json') || name.endsWith('.tmp')) continue
    const fileEntry = await readModuleFileEntry(path.join(modDir, name), name)
    if (fileEntry) entries.push(fileEntry)
  }
  return entries
}

async function evictOldestModules(fileEntries: FileEntry[], maxBytes: number): Promise<number> {
  let totalSize = fileEntries.reduce((sum, e) => sum + e.size, 0)
  if (totalSize <= maxBytes) return totalSize

  const moduleEntries = fileEntries
    .filter((e) => e.isModule)
    .sort((a, b) => a.lastModified - b.lastModified)

  const targetSize = maxBytes * 0.8
  for (const entry of moduleEntries) {
    if (totalSize <= targetSize) break
    try {
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- deleting oldest module files to enforce size cap
      await fs.unlink(entry.filePath)
      totalSize -= entry.size
    } catch {
      // Skip if delete fails
    }
  }
  return totalSize
}

async function updateManifestAfterEviction(workspaceRoot: string, totalSize: number): Promise<void> {
  const modDir = modulesDir(workspaceRoot)
  const manifest = await readManifest(workspaceRoot)
  if (!manifest) return

  const survivingIds = new Set<string>()
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- path derived from validated workspace root
    const remaining = await fs.readdir(modDir)
    for (const name of remaining) {
      if (name.endsWith('.json') && !name.endsWith('.tmp')) {
        survivingIds.add(name.replace(/\.json$/, ''))
      }
    }
  } catch {
    // modules dir gone — clear all hashes
  }

  const updatedHashes: Record<string, string> = {}
  for (const [id, hash] of Object.entries(manifest.moduleHashes)) {
    // eslint-disable-next-line security/detect-object-injection -- iterating over Object.entries, hash values are safe strings
    if (survivingIds.has(sanitizeModuleId(id))) { updatedHashes[id] = hash }
  }
  manifest.moduleHashes = updatedHashes
  manifest.totalSizeBytes = totalSize
  await writeManifest(workspaceRoot, manifest)
}

/** Enforce total size cap — deletes oldest module entries if over limit */
export async function enforceSizeCap(workspaceRoot: string, maxBytes: number): Promise<void> {
  const ctxDir = contextDir(workspaceRoot)
  const modDir = modulesDir(workspaceRoot)

  const topEntries = await readTopLevelEntries(ctxDir)
  if (!topEntries) return // .context/ doesn't exist yet

  const modEntries = await readModuleDirEntries(modDir)
  const allEntries = [...topEntries, ...modEntries]

  const totalSize = await evictOldestModules(allEntries, maxBytes)
  if (totalSize < allEntries.reduce((sum, e) => sum + e.size, 0)) {
    await updateManifestAfterEviction(workspaceRoot, totalSize)
  }
}

/** Ensure .context/ is in .gitignore */
export async function ensureGitignore(workspaceRoot: string): Promise<void> {
  const gitignorePath = path.join(workspaceRoot, '.gitignore')
  let content: string
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- path derived from validated workspace root
    content = await fs.readFile(gitignorePath, 'utf-8')
  } catch (error: unknown) {
    if (isFileNotFoundError(error)) {
      // Create .gitignore with the context entry
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- creating .gitignore at workspace root
      await fs.writeFile(gitignorePath, '# AI context layer (auto-generated)\n.context/\n', 'utf-8')
      return
    }
    log.warn('[context-layer] Failed to read .gitignore:', error)
    return
  }

  // Check if .context/ or .context is already listed
  const lines = content.split(/\r?\n/)
  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed === '.context/' || trimmed === '.context') {
      return // Already present
    }
  }

  // Append the entry
  const suffix = content.endsWith('\n') ? '' : '\n'
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- appending to .gitignore at workspace root
  await fs.writeFile(
    gitignorePath,
    `${content}${suffix}\n# AI context layer (auto-generated)\n.context/\n`,
    'utf-8'
  )
}

// ---------------------------------------------------------------------------
// Exported helpers for testing
// ---------------------------------------------------------------------------

export { contextDir, manifestPath, moduleEntryPath,modulesDir, repoMapPath, sanitizeModuleId }
