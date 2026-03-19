import { spawn } from 'child_process'
import type { BrowserWindow } from 'electron'
import fs from 'fs/promises'
import path from 'path'

import { getConfigValue, setConfigValue } from './config'
import { broadcastToWebClients } from './web/webServer'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ClaudeMdGenerationResult {
  dirPath: string
  filePath: string
  status: 'created' | 'updated' | 'skipped' | 'error'
  error?: string
}

interface ClaudeMdGenerationStatus {
  running: boolean
  currentDir?: string
  progress?: { completed: number; total: number }
  lastRun?: { timestamp: number; results: ClaudeMdGenerationResult[] }
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const AUTO_START_MARKER = '<!-- claude-md-auto:start -->'
const AUTO_END_MARKER = '<!-- claude-md-auto:end -->'
const MANUAL_PRESERVED_MARKER = '<!-- claude-md-manual:preserved -->'

const SKIP_DIRS = new Set([
  'node_modules', 'dist', '.git', '.claude', 'build', 'out',
])

const CODE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx'])

const MAX_DEPTH = 3
const CLAUDE_TIMEOUT_MS = 120_000
const MAX_KEY_FILES = 5
const KEY_FILE_HEAD_LINES = 50
const MIN_FILE_COUNT = 3
const KEY_FILE_MIN_LINES = 100
const COOLDOWN_MS = 180_000 // Ignore triggers for 3min after generation completes

// ---------------------------------------------------------------------------
// Module state
// ---------------------------------------------------------------------------

let mainWindow: BrowserWindow | null = null

let status: ClaudeMdGenerationStatus = {
  running: false,
}

/** Timestamp of last generation completion — used to suppress recursive triggers.
 *  Persisted to config so it survives app restarts. */
let lastCompletedAt = 0

function loadCooldownTimestamp(): number {
  try {
    const settings = getConfigValue('claudeMdSettings')
    return (settings as Record<string, unknown>)._lastCompletedAt as number ?? 0
  } catch { return 0 }
}

function saveCooldownTimestamp(ts: number): void {
  try {
    const settings = getConfigValue('claudeMdSettings')
    setConfigValue('claudeMdSettings', { ...settings, _lastCompletedAt: ts } as typeof settings)
  } catch { /* ignore */ }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toForwardSlash(p: string): string {
  return p.replace(/\\/g, '/')
}

function broadcastStatus(): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('claudeMd:statusChange', status)
  }
  broadcastToWebClients('claudeMd:statusChange', status)
}

function updateStatus(patch: Partial<ClaudeMdGenerationStatus>): void {
  status = { ...status, ...patch }
  broadcastStatus()
}

/**
 * Discover directories under `srcRoot` that contain at least MIN_FILE_COUNT
 * code files (.ts/.tsx/.js/.jsx), up to MAX_DEPTH levels.
 */
async function discoverDirectories(srcRoot: string, depth: number = 0): Promise<string[]> {
  if (depth > MAX_DEPTH) return []

  let entries: Awaited<ReturnType<typeof fs.readdir>>
  try {
    entries = await fs.readdir(srcRoot, { withFileTypes: true })
  } catch {
    return []
  }

  const dirs: string[] = []
  let codeFileCount = 0

  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) {
        const childDir = path.join(srcRoot, entry.name)
        const childDirs = await discoverDirectories(childDir, depth + 1)
        dirs.push(...childDirs)
      }
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase()
      if (CODE_EXTENSIONS.has(ext)) {
        codeFileCount++
      }
    }
  }

  if (codeFileCount >= MIN_FILE_COUNT) {
    dirs.push(srcRoot)
  }

  return dirs
}

/**
 * Build a file listing for a directory, returning name and approximate size.
 */
async function buildFileListing(dirPath: string): Promise<Array<{ name: string; size: number; lines: number }>> {
  const entries = await fs.readdir(dirPath, { withFileTypes: true })
  const files: Array<{ name: string; size: number; lines: number }> = []

  for (const entry of entries) {
    if (!entry.isFile()) continue
    const ext = path.extname(entry.name).toLowerCase()
    if (!CODE_EXTENSIONS.has(ext)) continue

    const filePath = path.join(dirPath, entry.name)
    try {
      const stat = await fs.stat(filePath)
      const content = await fs.readFile(filePath, 'utf-8')
      const lineCount = content.split('\n').length
      files.push({ name: entry.name, size: stat.size, lines: lineCount })
    } catch {
      // Skip files we can't read
    }
  }

  return files.sort((a, b) => b.lines - a.lines)
}

/**
 * Read the first N lines of key files (those over KEY_FILE_MIN_LINES lines, up to MAX_KEY_FILES).
 */
async function readKeyFileExcerpts(
  dirPath: string,
  fileListing: Array<{ name: string; size: number; lines: number }>,
): Promise<string> {
  const keyFiles = fileListing
    .filter((f) => f.lines >= KEY_FILE_MIN_LINES)
    .slice(0, MAX_KEY_FILES)

  if (keyFiles.length === 0) return ''

  const excerpts: string[] = []
  for (const file of keyFiles) {
    const filePath = path.join(dirPath, file.name)
    try {
      const content = await fs.readFile(filePath, 'utf-8')
      const lines = content.split('\n').slice(0, KEY_FILE_HEAD_LINES)
      excerpts.push(`### ${file.name} (first ${KEY_FILE_HEAD_LINES} lines of ${file.lines}):\n\`\`\`\n${lines.join('\n')}\n\`\`\``)
    } catch {
      // Skip unreadable files
    }
  }

  return excerpts.join('\n\n')
}

/**
 * Read a parent CLAUDE.md if one exists in ancestor directories.
 */
async function readParentClaudeMd(dirPath: string, projectRoot: string): Promise<string | null> {
  let current = path.dirname(dirPath)
  while (current.length >= projectRoot.length) {
    const candidate = path.join(current, 'CLAUDE.md')
    try {
      const content = await fs.readFile(candidate, 'utf-8')
      return content
    } catch {
      // No CLAUDE.md here, go up
    }
    const parent = path.dirname(current)
    if (parent === current) break
    current = parent
  }
  return null
}

/**
 * Build the prompt to send to Claude for generating CLAUDE.md content.
 */
async function buildPrompt(dirPath: string, projectRoot: string): Promise<string> {
  const relPath = toForwardSlash(path.relative(projectRoot, dirPath))
  const fileListing = await buildFileListing(dirPath)
  const keyExcerpts = await readKeyFileExcerpts(dirPath, fileListing)
  const parentContent = await readParentClaudeMd(dirPath, projectRoot)

  const fileListStr = fileListing
    .map((f) => `  - ${f.name} (${f.lines} lines, ${Math.round(f.size / 1024)}KB)`)
    .join('\n')

  let prompt = `You are generating a CLAUDE.md file for a directory in an Electron IDE codebase.

## Directory
Path: ${relPath}/

## Files in this directory
${fileListStr}

`

  if (keyExcerpts) {
    prompt += `## Key file excerpts
${keyExcerpts}

`
  }

  if (parentContent) {
    prompt += `## Parent CLAUDE.md (for context)
\`\`\`
${parentContent.slice(0, 2000)}
\`\`\`

`
  }

  prompt += `## Instructions
Generate concise, useful CLAUDE.md content for this directory. Include:
1. A one-line summary of what this directory does
2. Key files and their roles (table format preferred)
3. Important patterns or conventions specific to this directory
4. Any gotchas or non-obvious behaviors
5. Dependencies and relationships with other parts of the codebase

Keep it practical and concise. No boilerplate. No generic advice.
Output ONLY the markdown content — no wrapping fences, no preamble.`

  return prompt
}

/**
 * Spawn Claude CLI to generate content from a prompt.
 */
function spawnClaude(prompt: string, model: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const args = ['-p', '--output-format', 'text', '--model', model]
    const child = spawn('claude', args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: CLAUDE_TIMEOUT_MS,
    })

    let stdout = ''
    let stderr = ''

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString()
    })

    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString()
    })

    child.on('error', (err) => {
      reject(new Error(`Failed to spawn claude: ${err.message}`))
    })

    child.on('close', (code) => {
      if (code === 0) {
        resolve(stdout.trim())
      } else {
        reject(new Error(`claude exited with code ${code}: ${stderr.trim()}`))
      }
    })

    // Pipe prompt via stdin
    child.stdin.write(prompt)
    child.stdin.end()

    // Enforce timeout
    setTimeout(() => {
      try { child.kill() } catch { /* ignore */ }
      reject(new Error(`claude timed out after ${CLAUDE_TIMEOUT_MS / 1000}s`))
    }, CLAUDE_TIMEOUT_MS)
  })
}

/**
 * Write generated content into a CLAUDE.md file, preserving manual sections.
 */
async function writeClaudeMd(filePath: string, generatedContent: string): Promise<'created' | 'updated'> {
  let existingContent: string | null = null
  try {
    existingContent = await fs.readFile(filePath, 'utf-8')
  } catch {
    // File doesn't exist
  }

  const autoBlock = `${AUTO_START_MARKER}\n${generatedContent}\n${AUTO_END_MARKER}`

  if (existingContent === null) {
    // No existing file — create entirely within markers
    await fs.writeFile(filePath, autoBlock + '\n', 'utf-8')
    return 'created'
  }

  const startIdx = existingContent.indexOf(AUTO_START_MARKER)
  const endIdx = existingContent.indexOf(AUTO_END_MARKER)

  if (startIdx !== -1 && endIdx !== -1) {
    // Markers exist — replace only the auto section
    const before = existingContent.slice(0, startIdx)
    const after = existingContent.slice(endIdx + AUTO_END_MARKER.length)
    await fs.writeFile(filePath, before + autoBlock + after, 'utf-8')
    return 'updated'
  }

  // Existing file without markers — prepend auto section, preserve existing content
  const newContent = `${autoBlock}\n\n${MANUAL_PRESERVED_MARKER}\n${existingContent}`
  await fs.writeFile(filePath, newContent, 'utf-8')
  return 'updated'
}

/**
 * Get directories with changes based on git status.
 */
async function getChangedDirectories(projectRoot: string): Promise<Set<string>> {
  return new Promise((resolve) => {
    const child = spawn('git', ['status', '--porcelain', '-u'], {
      cwd: projectRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    let stdout = ''
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString()
    })

    child.on('error', () => {
      // If git fails, return empty set (will fall back to full sweep)
      resolve(new Set())
    })

    child.on('close', () => {
      const dirs = new Set<string>()
      const lines = stdout.split('\n').filter(Boolean)
      for (const line of lines) {
        // Porcelain format: XY filename
        const filePath = line.slice(3).trim()
        if (filePath) {
          const dirName = path.dirname(filePath)
          dirs.add(path.join(projectRoot, dirName))
        }
      }
      resolve(dirs)
    })
  })
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function initClaudeMdGenerator(win: BrowserWindow): void {
  mainWindow = win
  lastCompletedAt = loadCooldownTimestamp()
  console.log('[claude-md] Generator initialized')
}

export async function generateForDirectory(
  projectRoot: string,
  dirPath: string,
): Promise<ClaudeMdGenerationResult> {
  const relPath = toForwardSlash(path.relative(projectRoot, dirPath))
  const filePath = path.join(dirPath, 'CLAUDE.md')

  const settings = getConfigValue('claudeMdSettings')
  if (!settings.enabled) {
    console.log(`[claude-md] Skipping ${relPath} — generation disabled`)
    return { dirPath: relPath, filePath: toForwardSlash(filePath), status: 'skipped' }
  }

  // Check exclude list
  const excludeDirs = settings.excludeDirs || []
  for (const exclude of excludeDirs) {
    if (relPath.startsWith(exclude) || relPath === exclude) {
      console.log(`[claude-md] Skipping ${relPath} — excluded`)
      return { dirPath: relPath, filePath: toForwardSlash(filePath), status: 'skipped' }
    }
  }

  console.log(`[claude-md] Generating for ${relPath}`)
  updateStatus({ currentDir: relPath })

  try {
    const prompt = await buildPrompt(dirPath, projectRoot)
    const model = settings.model || 'sonnet'
    const generated = await spawnClaude(prompt, model)

    if (!generated || generated.length < 10) {
      console.log(`[claude-md] Skipping ${relPath} — empty response from Claude`)
      return { dirPath: relPath, filePath: toForwardSlash(filePath), status: 'skipped' }
    }

    const writeStatus = await writeClaudeMd(filePath, generated)
    console.log(`[claude-md] ${writeStatus} ${relPath}/CLAUDE.md`)
    return { dirPath: relPath, filePath: toForwardSlash(filePath), status: writeStatus }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    console.log(`[claude-md] Error generating for ${relPath}: ${errorMsg}`)
    return { dirPath: relPath, filePath: toForwardSlash(filePath), status: 'error', error: errorMsg }
  }
}

export async function generateClaudeMd(
  projectRoot: string,
  options?: { fullSweep?: boolean },
): Promise<ClaudeMdGenerationResult[]> {
  if (status.running) {
    console.log('[claude-md] Generation already in progress, skipping')
    return []
  }

  // Prevent recursive triggers: each `claude -p` invocation fires its own
  // session_stop hook, which would re-trigger generation. The cooldown ensures
  // we ignore those cascading events.
  if (Date.now() - lastCompletedAt < COOLDOWN_MS) {
    console.log('[claude-md] Cooldown active — skipping (likely recursive trigger from generator-spawned claude processes)')
    return []
  }

  const settings = getConfigValue('claudeMdSettings')
  if (!settings.enabled) {
    console.log('[claude-md] Generation disabled in settings')
    return []
  }

  updateStatus({ running: true, progress: { completed: 0, total: 0 } })

  const results: ClaudeMdGenerationResult[] = []

  try {
    // Discover all candidate directories under src/
    const srcPath = path.join(projectRoot, 'src')
    const allDirs: string[] = []

    // Include project root if generateRoot is enabled
    if (settings.generateRoot) {
      allDirs.push(projectRoot)
    }

    // Include subdirectories if generateSubdirs is enabled
    if (settings.generateSubdirs) {
      try {
        const discovered = await discoverDirectories(srcPath)
        allDirs.push(...discovered)
      } catch {
        console.log('[claude-md] Could not discover directories under src/')
      }
    }

    // Filter to changed directories if not a full sweep
    let targetDirs = allDirs
    if (!options?.fullSweep) {
      const changedDirs = await getChangedDirectories(projectRoot)
      if (changedDirs.size > 0) {
        targetDirs = allDirs.filter((d) => {
          // Include directory if it or any of its children have changes
          for (const changed of changedDirs) {
            if (changed.startsWith(d) || d.startsWith(changed)) return true
          }
          return false
        })
        console.log(`[claude-md] Filtered to ${targetDirs.length} changed directories (of ${allDirs.length} total)`)
      }
      // If no changed dirs detected, fall back to all dirs
      if (targetDirs.length === 0) {
        targetDirs = allDirs
      }
    }

    updateStatus({ progress: { completed: 0, total: targetDirs.length } })

    // Process directories sequentially
    for (let i = 0; i < targetDirs.length; i++) {
      const dir = targetDirs[i]
      const result = await generateForDirectory(projectRoot, dir)
      results.push(result)
      updateStatus({ progress: { completed: i + 1, total: targetDirs.length } })
    }

    console.log(`[claude-md] Generation complete: ${results.length} directories processed`)
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    console.log(`[claude-md] Fatal error during generation: ${errorMsg}`)
  } finally {
    lastCompletedAt = Date.now()
    saveCooldownTimestamp(lastCompletedAt)
    updateStatus({
      running: false,
      currentDir: undefined,
      progress: undefined,
      lastRun: { timestamp: Date.now(), results },
    })
  }

  return results
}

export function getGenerationStatus(): ClaudeMdGenerationStatus {
  return { ...status }
}
