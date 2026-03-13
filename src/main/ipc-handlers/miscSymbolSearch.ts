import { app } from 'electron'
import fs from 'fs/promises'
import path from 'path'

const HISTORY_FILE_NAMES = ['.zsh_history', '.bash_history'] as const
const MAX_HISTORY_COMMANDS = 500
const MAX_SYMBOL_FILES = 200
const MAX_SYMBOLS = 5000
const MAX_SYMBOL_FILE_BYTES = 500 * 1024
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.py', '.rs', '.go', '.css'])
const SYMBOL_IGNORE_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'out',
  '__pycache__',
  '.next',
  '.cache',
  'coverage',
  'build',
])

const SYMBOL_PATTERNS: Array<{ type: string; regex: RegExp }> = [
  { type: 'function', regex: /(?:export\s+)?(?:async\s+)?function\s+(\w+)/g },
  { type: 'class', regex: /(?:export\s+)?(?:abstract\s+)?class\s+(\w+)/g },
  { type: 'interface', regex: /(?:export\s+)?interface\s+(\w+)/g },
  { type: 'type', regex: /(?:export\s+)?type\s+(\w+)\s*=/g },
  { type: 'const', regex: /(?:export\s+)?const\s+(\w+)\s*(?:=|:)/g },
  { type: 'def', regex: /^def\s+(\w+)/gm },
  { type: 'fn', regex: /(?:pub\s+)?(?:async\s+)?fn\s+(\w+)/g },
]

export interface SymbolEntry {
  name: string
  type: string
  filePath: string
  relativePath: string
  line: number
}

interface SymbolSource {
  content: string
  filePath: string
  relativePath: string
}

interface SymbolWalkContext {
  root: string
  dirPath: string
}

function extractHistoryCommand(line: string): string | null {
  const trimmed = line.trim()
  if (!trimmed) {
    return null
  }

  const zshMatch = trimmed.match(/^:\s*\d+:\d+;(.+)$/)
  if (zshMatch) {
    return zshMatch[1]
  }

  return trimmed.startsWith(':') ? null : trimmed
}

function dedupeRecentCommands(commands: string[]): string[] {
  const seen = new Set<string>()
  const deduped: string[] = []

  for (let index = commands.length - 1; index >= 0; index -= 1) {
    const command = commands[index].trim()
    if (!command || seen.has(command)) {
      continue
    }

    seen.add(command)
    deduped.push(command)
    if (deduped.length >= MAX_HISTORY_COMMANDS) {
      break
    }
  }

  return deduped
}

async function readHistoryFile(filePath: string): Promise<string[] | null> {
  try {
    const raw = await fs.readFile(filePath, 'utf-8')
    const commands = raw
      .split('\n')
      .map(extractHistoryCommand)
      .filter((command): command is string => Boolean(command))
    return dedupeRecentCommands(commands)
  } catch {
    return null
  }
}

export async function readShellHistory(): Promise<string[]> {
  const homeDir = app.getPath('home')

  for (const fileName of HISTORY_FILE_NAMES) {
    const commands = await readHistoryFile(path.join(homeDir, fileName))
    if (commands) {
      return commands
    }
  }

  return []
}

function buildLineStartOffsets(content: string): number[] {
  const offsets = [0]
  for (let index = 0; index < content.length; index += 1) {
    if (content[index] === '\n') {
      offsets.push(index + 1)
    }
  }
  return offsets
}

function offsetToLine(lineStartOffsets: number[], charOffset: number): number {
  let low = 0
  let high = lineStartOffsets.length - 1

  while (low < high) {
    const middle = (low + high + 1) >> 1
    if (lineStartOffsets[middle] <= charOffset) {
      low = middle
    } else {
      high = middle - 1
    }
  }

  return low + 1
}

function collectMatches(source: SymbolSource, symbols: SymbolEntry[]): boolean {
  const { content, filePath, relativePath } = source
  const lineStartOffsets = buildLineStartOffsets(content)

  for (const { type, regex } of SYMBOL_PATTERNS) {
    regex.lastIndex = 0
    let match: RegExpExecArray | null

    while ((match = regex.exec(content)) !== null) {
      if (symbols.length >= MAX_SYMBOLS) {
        return true
      }

      const name = match[1]
      if (!name) {
        continue
      }

      symbols.push({
        name,
        type,
        filePath,
        relativePath,
        line: offsetToLine(lineStartOffsets, match.index),
      })
    }
  }

  return false
}

async function addSymbolsFromFile(root: string, filePath: string, symbols: SymbolEntry[]): Promise<void> {
  const stat = await fs.stat(filePath)
  if (stat.size > MAX_SYMBOL_FILE_BYTES) {
    return
  }

  const content = await fs.readFile(filePath, 'utf-8')
  collectMatches(
    {
      content,
      filePath,
      relativePath: path.relative(root, filePath).replace(/\\/g, '/'),
    },
    symbols
  )
}

function shouldStop(fileCount: number, symbolCount: number): boolean {
  return fileCount >= MAX_SYMBOL_FILES || symbolCount >= MAX_SYMBOLS
}

async function walkForSymbols(
  root: string,
  dirPath: string,
  symbols: SymbolEntry[],
  counts: { files: number }
): Promise<void> {
  if (shouldStop(counts.files, symbols.length)) {
    return
  }

  let entries: import('fs').Dirent[]
  try {
    entries = await fs.readdir(dirPath, { withFileTypes: true })
  } catch {
    return
  }

  const childDirectories = getChildDirectories(entries, dirPath)
  await collectDirectorySymbols({ root, dirPath }, entries, symbols, counts)
  await walkChildDirectories(root, childDirectories, symbols, counts)
}

export async function searchSymbols(root: string): Promise<SymbolEntry[]> {
  const symbols: SymbolEntry[] = []
  await walkForSymbols(root, root, symbols, { files: 0 })
  return symbols
}

function getChildDirectories(entries: import('fs').Dirent[], dirPath: string): string[] {
  return entries
    .filter((entry) => entry.isDirectory() && !SYMBOL_IGNORE_DIRS.has(entry.name))
    .map((entry) => path.join(dirPath, entry.name))
}

async function collectDirectorySymbols(
  context: SymbolWalkContext,
  entries: import('fs').Dirent[],
  symbols: SymbolEntry[],
  counts: { files: number }
): Promise<void> {
  for (const entry of entries) {
    if (!shouldProcessEntry(entry, counts.files, symbols.length)) {
      continue
    }

    const filePath = path.join(context.dirPath, entry.name)
    try {
      await addSymbolsFromFile(context.root, filePath, symbols)
      counts.files += 1
    } catch {
      // Skip unreadable files.
    }
  }
}

function shouldProcessEntry(
  entry: import('fs').Dirent,
  fileCount: number,
  symbolCount: number
): boolean {
  if (!entry.isFile() || shouldStop(fileCount, symbolCount)) {
    return false
  }

  const extension = path.extname(entry.name).toLowerCase()
  return SOURCE_EXTENSIONS.has(extension)
}

async function walkChildDirectories(
  root: string,
  childDirectories: string[],
  symbols: SymbolEntry[],
  counts: { files: number }
): Promise<void> {
  for (const childDir of childDirectories) {
    if (shouldStop(counts.files, symbols.length)) {
      return
    }
    await walkForSymbols(root, childDir, symbols, counts)
  }
}
