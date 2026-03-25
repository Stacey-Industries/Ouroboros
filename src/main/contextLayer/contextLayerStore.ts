import fs from 'fs/promises'
import path from 'path'
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
  await fs.writeFile(tmpPath, content, 'utf-8')
  try {
    await fs.rename(tmpPath, filePath)
  } catch (renameError) {
    try {
      await fs.unlink(tmpPath)
    } catch {
      // Best effort cleanup — ignore if .tmp is already gone
    }
    console.warn('[context-layer] Atomic rename failed, .tmp cleaned up:', filePath, renameError)
    throw renameError
  }
}

// ---------------------------------------------------------------------------
// Safe JSON read — returns null if missing or corrupt
// ---------------------------------------------------------------------------

async function readJsonSafe<T>(filePath: string): Promise<T | null> {
  let raw: string
  try {
    raw = await fs.readFile(filePath, 'utf-8')
  } catch (error: unknown) {
    if (isFileNotFoundError(error)) {
      return null
    }
    console.warn('[context-layer] Failed to read file:', filePath, error)
    return null
  }

  try {
    return JSON.parse(raw) as T
  } catch {
    console.warn('[context-layer] Corrupt JSON — deleting:', filePath)
    try {
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
  await fs.mkdir(contextDir(workspaceRoot), { recursive: true })
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
    await fs.unlink(filePath)
  } catch (error: unknown) {
    if (!isFileNotFoundError(error)) {
      console.warn('[context-layer] Failed to delete module entry:', filePath, error)
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

/** Enforce total size cap — deletes oldest module entries if over limit */
export async function enforceSizeCap(workspaceRoot: string, maxBytes: number): Promise<void> {
  const ctxDir = contextDir(workspaceRoot)
  const modDir = modulesDir(workspaceRoot)

  // Gather all file sizes in .context/ (top-level files)
  interface FileEntry {
    filePath: string
    size: number
    isModule: boolean
    moduleId: string | null
    lastModified: number
  }

  const fileEntries: FileEntry[] = []

  // Read top-level .context/ files
  try {
    const topEntries = await fs.readdir(ctxDir)
    for (const name of topEntries) {
      if (name === 'modules') continue
      const filePath = path.join(ctxDir, name)
      try {
        const stat = await fs.stat(filePath)
        if (stat.isFile()) {
          fileEntries.push({
            filePath,
            size: stat.size,
            isModule: false,
            moduleId: null,
            lastModified: stat.mtimeMs,
          })
        }
      } catch {
        // Skip files we can't stat
      }
    }
  } catch {
    // .context/ doesn't exist yet — nothing to enforce
    return
  }

  // Read modules/ files
  try {
    const modEntries = await fs.readdir(modDir)
    for (const name of modEntries) {
      if (!name.endsWith('.json') || name.endsWith('.tmp')) continue
      const filePath = path.join(modDir, name)
      try {
        const stat = await fs.stat(filePath)
        if (stat.isFile()) {
          // Try to read the module entry to get structural lastModified
          const entry = await readJsonSafe<ModuleContextEntry>(filePath)
          const structuralLastModified = entry?.structural?.lastModified ?? 0
          fileEntries.push({
            filePath,
            size: stat.size,
            isModule: true,
            moduleId: name.replace(/\.json$/, ''),
            lastModified: structuralLastModified || stat.mtimeMs,
          })
        }
      } catch {
        // Skip files we can't stat
      }
    }
  } catch {
    // modules/ doesn't exist — nothing to evict
  }

  let totalSize = fileEntries.reduce((sum, entry) => sum + entry.size, 0)
  if (totalSize <= maxBytes) {
    return
  }

  // Sort module entries by lastModified ascending (oldest first)
  const moduleEntries = fileEntries
    .filter((entry) => entry.isModule)
    .sort((left, right) => left.lastModified - right.lastModified)

  const targetSize = maxBytes * 0.8

  for (const entry of moduleEntries) {
    if (totalSize <= targetSize) {
      break
    }
    try {
      await fs.unlink(entry.filePath)
      totalSize -= entry.size
    } catch {
      // Skip if we can't delete
    }
  }

  // Update manifest — remove deleted module hashes
  const manifest = await readManifest(workspaceRoot)
  if (manifest) {
    const remainingModules = moduleEntries.filter((entry) => {
      try {
        // Check if file still exists (was not deleted)
        return fileEntries.some(
          (fe) => fe.filePath === entry.filePath && totalSize <= targetSize
        )
      } catch {
        return false
      }
    })
    // Rebuild moduleHashes from surviving modules
    const survivingIds = new Set<string>()
    try {
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
      if (survivingIds.has(sanitizeModuleId(id))) {
        updatedHashes[id] = hash
      }
    }
    manifest.moduleHashes = updatedHashes
    manifest.totalSizeBytes = totalSize
    await writeManifest(workspaceRoot, manifest)
  }
}

/** Ensure .context/ is in .gitignore */
export async function ensureGitignore(workspaceRoot: string): Promise<void> {
  const gitignorePath = path.join(workspaceRoot, '.gitignore')
  let content: string
  try {
    content = await fs.readFile(gitignorePath, 'utf-8')
  } catch (error: unknown) {
    if (isFileNotFoundError(error)) {
      // Create .gitignore with the context entry
      await fs.writeFile(gitignorePath, '# AI context layer (auto-generated)\n.context/\n', 'utf-8')
      return
    }
    console.warn('[context-layer] Failed to read .gitignore:', error)
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
  await fs.writeFile(
    gitignorePath,
    `${content}${suffix}\n# AI context layer (auto-generated)\n.context/\n`,
    'utf-8'
  )
}

// ---------------------------------------------------------------------------
// Exported helpers for testing
// ---------------------------------------------------------------------------

export { sanitizeModuleId, contextDir, modulesDir, repoMapPath, manifestPath, moduleEntryPath }
