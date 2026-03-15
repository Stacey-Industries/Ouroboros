import fs from 'fs/promises'
import net from 'net'
import path from 'path'
import type {
  DirtyBufferSnapshot,
  EditorSelectionRange,
  LiveIdeState,
} from './types'

export interface ContextFileSnapshot {
  filePath: string
  content: string | null
  unsaved: boolean
}

interface IdeToolResponse<T> {
  id: string
  result?: T
  error?: { code: number; message: string }
}

const IDE_TOOL_SERVER_ADDRESS = process.platform === 'win32' ? '\\\\.\\pipe\\ouroboros-tools' : '/tmp/ouroboros-tools.sock'

let queryCounter = 0

export function toPathKey(filePath: string): string {
  return path.normalize(filePath).toLowerCase()
}

export function uniqueFiles(filePaths: string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const filePath of filePaths) {
    if (!filePath) continue
    const key = toPathKey(filePath)
    if (seen.has(key)) continue
    seen.add(key)
    result.push(path.normalize(filePath))
  }
  return result
}

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

export async function resolveWorkspaceFile(filePath: string, workspaceRoots: string[], preferredRoot?: string): Promise<string> {
  if (!filePath) return filePath
  if (path.isAbsolute(filePath)) return path.normalize(filePath)
  const roots = uniqueFiles([...(preferredRoot ? [preferredRoot] : []), ...workspaceRoots])
  for (const root of roots) {
    const candidate = path.normalize(path.resolve(root, filePath))
    if (await exists(candidate)) return candidate
  }
  return path.normalize(path.resolve(roots[0] ?? process.cwd(), filePath))
}

export async function invokeIdeTool<TResult>(method: string, params?: Record<string, unknown>): Promise<TResult | null> {
  const requestId = `ctx_${++queryCounter}_${Date.now()}`
  return new Promise((resolve) => {
    const socket = net.createConnection(IDE_TOOL_SERVER_ADDRESS)
    let settled = false
    let buffer = ''
    const finalize = (value: TResult | null) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      socket.destroy()
      resolve(value)
    }
    const timer = setTimeout(() => finalize(null), 10_000)
    socket.setEncoding('utf8')
    socket.on('connect', () => {
      socket.write(JSON.stringify({ id: requestId, method, params }) + '\n')
    })
    socket.on('data', (chunk: string) => {
      buffer += chunk
      const newlineIndex = buffer.indexOf('\n')
      if (newlineIndex === -1) return
      const line = buffer.slice(0, newlineIndex).trim()
      try {
        const response = JSON.parse(line) as IdeToolResponse<TResult>
        finalize(response.error ? null : (response.result ?? null))
      } catch {
        finalize(null)
      }
    })
    socket.on('error', () => finalize(null))
    socket.on('close', () => finalize(null))
  })
}

export async function loadContextFileSnapshot(
  filePath: string,
  cache?: Map<string, ContextFileSnapshot>,
): Promise<ContextFileSnapshot> {
  const key = toPathKey(filePath)
  const cached = cache?.get(key)
  if (cached) return cached

  const liveResult = await invokeIdeTool<{ content?: unknown; unsaved?: unknown }>('ide.getFileContent', { path: filePath })
  if (typeof liveResult?.content === 'string') {
    const snapshot = { filePath, content: liveResult.content, unsaved: liveResult.unsaved === true }
    cache?.set(key, snapshot)
    return snapshot
  }

  try {
    const content = await fs.readFile(filePath, 'utf-8')
    const snapshot = { filePath, content, unsaved: false }
    cache?.set(key, snapshot)
    return snapshot
  } catch {
    const snapshot = { filePath, content: null, unsaved: false }
    cache?.set(key, snapshot)
    return snapshot
  }
}

function toSelectionRange(selection: unknown): EditorSelectionRange | undefined {
  if (!selection || typeof selection !== 'object') return undefined
  const startLine = (selection as { startLine?: unknown }).startLine
  const endLine = (selection as { endLine?: unknown }).endLine
  if (typeof startLine !== 'number' || typeof endLine !== 'number') return undefined
  return {
    startLine,
    startCharacter: 0,
    endLine,
    endCharacter: 0,
  }
}

async function resolveOpenFileEntries(workspaceRoots: string[]): Promise<Array<{ filePath: string; dirty: boolean }>> {
  const openFilesResult = await invokeIdeTool<Array<{ path?: unknown; dirty?: unknown }>>('ide.getOpenFiles')
  return Promise.all((openFilesResult ?? [])
    .filter((entry) => typeof entry?.path === 'string')
    .map(async (entry) => ({
      filePath: await resolveWorkspaceFile(entry.path as string, workspaceRoots),
      dirty: entry.dirty === true,
    })))
}

async function resolveSelectionFile(selectionResult: unknown, workspaceRoots: string[]): Promise<string | undefined> {
  const filePath = (selectionResult as { filePath?: unknown } | null)?.filePath
  if (typeof filePath !== 'string') return undefined
  return resolveWorkspaceFile(filePath, workspaceRoots)
}

async function buildDirtyBuffers(
  dirtyFiles: string[],
  selectionFile: string | undefined,
  selection: EditorSelectionRange | undefined,
  cache: Map<string, ContextFileSnapshot>,
): Promise<DirtyBufferSnapshot[]> {
  const dirtyBuffers: DirtyBufferSnapshot[] = []
  for (const filePath of dirtyFiles) {
    const snapshot = await loadContextFileSnapshot(filePath, cache)
    if (typeof snapshot.content !== 'string') continue
    dirtyBuffers.push({
      filePath,
      content: snapshot.content,
      selection: selectionFile && toPathKey(selectionFile) === toPathKey(filePath) ? selection : undefined,
      updatedAt: Date.now(),
    })
  }
  return dirtyBuffers
}

export async function collectLiveIdeState(
  workspaceRoots: string[],
  selectedFiles: string[],
  cache: Map<string, ContextFileSnapshot>,
): Promise<LiveIdeState> {
  const [openFileEntries, activeFileResult, selectionResult] = await Promise.all([
    resolveOpenFileEntries(workspaceRoots),
    invokeIdeTool<{ path?: unknown }>('ide.getActiveFile'),
    invokeIdeTool('ide.getSelection'),
  ])
  const openFiles = uniqueFiles(openFileEntries.map((entry) => entry.filePath))
  const dirtyFiles = uniqueFiles(openFileEntries.filter((entry) => entry.dirty).map((entry) => entry.filePath))
  const activeFile = typeof activeFileResult?.path === 'string'
    ? await resolveWorkspaceFile(activeFileResult.path, workspaceRoots)
    : undefined
  const selectionFile = await resolveSelectionFile(selectionResult, workspaceRoots)
  const selection = toSelectionRange(selectionResult)
  const dirtyBuffers = await buildDirtyBuffers(dirtyFiles, selectionFile, selection, cache)
  return {
    activeFile: activeFile ?? selectionFile,
    selectedFiles,
    openFiles: uniqueFiles(activeFile ? [...openFiles, activeFile] : openFiles),
    dirtyFiles,
    dirtyBuffers,
    selection,
    collectedAt: Date.now(),
  }
}

export function extractKeywords(goal: string, stopWords: ReadonlySet<string>, limit = 8): string[] {
  const matches = goal.toLowerCase().match(/[a-z0-9][a-z0-9_./-]*/g) ?? []
  const keywords: string[] = []
  const seen = new Set<string>()
  for (const match of matches) {
    const token = match.replace(/^\W+|\W+$/g, '')
    if (token.length < 3 || stopWords.has(token) || seen.has(token)) continue
    seen.add(token)
    keywords.push(token)
    if (keywords.length === limit) break
  }
  return keywords
}

export function findKeywordMatches(filePath: string, content: string | null, keywords: string[]): string[] {
  const pathValue = filePath.toLowerCase()
  const matches: string[] = []
  for (const keyword of keywords) {
    if (pathValue.includes(keyword) || (content && new RegExp(`\\b${escapeRegExp(keyword)}\\b`, 'i').test(content))) {
      matches.push(keyword)
    }
    if (matches.length === 3) break
  }
  return matches
}

export function extractImportSpecifiers(content: string | null): string[] {
  if (!content) return []
  return Array.from(content.matchAll(/(?:import\s+[^'"]*from\s*|export\s+[^'"]*from\s*|require\()\s*['"]([^'"]+)['"]/g))
    .flatMap((match) => match[1] ? [match[1]] : [])
}

export function referencesTarget(sourceFile: string, targetFile: string, imports: string[]): boolean {
  const relativeValue = path.posix.normalize(path.relative(path.dirname(sourceFile), targetFile).replace(/\\/g, '/'))
    .replace(/\.(tsx?|jsx?|mjs|cjs|json)$/i, '')
    .replace(/\/index$/i, '')
  const baseValue = path.basename(targetFile).replace(/\.(tsx?|jsx?|mjs|cjs|json)$/i, '')
  const candidates = new Set([relativeValue, relativeValue.startsWith('.') ? relativeValue : `./${relativeValue}`, baseValue])
  return imports.some((entry) => candidates.has(entry.replace(/\\/g, '/').replace(/\.(tsx?|jsx?|mjs|cjs|json)$/i, '').replace(/\/index$/i, '')) || entry.endsWith(`/${baseValue}`))
}
