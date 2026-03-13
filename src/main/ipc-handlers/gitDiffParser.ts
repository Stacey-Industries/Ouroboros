/**
 * gitDiffParser.ts — Unified diff parser for git output.
 */

import path from 'path'

export interface ParsedHunk {
  header: string
  oldStart: number
  oldCount: number
  newStart: number
  newCount: number
  lines: string[]
  rawPatch: string
}

export interface ParsedFileDiff {
  filePath: string
  relativePath: string
  status: 'modified' | 'added' | 'deleted' | 'renamed'
  hunks: ParsedHunk[]
  oldPath?: string
}

function detectFileStatus(lines: string[], aPath: string, bPath: string): { status: ParsedFileDiff['status']; oldPath?: string } {
  let status: ParsedFileDiff['status'] = 'modified'
  let oldPath: string | undefined

  for (const line of lines.slice(1, 6)) {
    if (line.startsWith('new file mode')) status = 'added'
    else if (line.startsWith('deleted file mode')) status = 'deleted'
    else if (line.startsWith('rename from')) {
      status = 'renamed'
      oldPath = line.replace('rename from ', '')
    }
  }
  if (aPath !== bPath && !oldPath) {
    status = 'renamed'
    oldPath = aPath
  }
  return { status, oldPath }
}

function parseHunks(lines: string[], startIdx: number, diffHeader: string): ParsedHunk[] {
  const hunks: ParsedHunk[] = []
  let i = startIdx

  while (i < lines.length) {
    if (!lines[i].startsWith('@@')) { i++; continue }

    const hunkHeader = lines[i]
    const m = hunkHeader.match(/@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/)
    if (!m) { i++; continue }

    const hunkLines: string[] = []
    i++
    while (i < lines.length && !lines[i].startsWith('@@') && !lines[i].startsWith('diff --git')) {
      hunkLines.push(lines[i])
      i++
    }

    hunks.push({
      header: hunkHeader,
      oldStart: parseInt(m[1], 10),
      oldCount: m[2] !== undefined ? parseInt(m[2], 10) : 1,
      newStart: parseInt(m[3], 10),
      newCount: m[4] !== undefined ? parseInt(m[4], 10) : 1,
      lines: hunkLines,
      rawPatch: diffHeader + hunkHeader + '\n' + hunkLines.join('\n') + '\n',
    })
  }
  return hunks
}

export function parseDiffOutput(diffText: string, root: string): ParsedFileDiff[] {
  if (!diffText.trim()) return []

  const files: ParsedFileDiff[] = []
  const fileDiffs = diffText.split(/^(?=diff --git )/m).filter(Boolean)

  for (const fileDiff of fileDiffs) {
    const lines = fileDiff.split('\n')
    if (lines.length === 0) continue

    const headerMatch = lines[0].match(/^diff --git a\/(.+?) b\/(.+)$/)
    if (!headerMatch) continue

    const { status, oldPath } = detectFileStatus(lines, headerMatch[1], headerMatch[2])
    const relativePath = headerMatch[2]

    let diffHeaderEnd = 0
    for (let i = 1; i < lines.length; i++) {
      if (lines[i].startsWith('@@')) { diffHeaderEnd = i; break }
    }
    const diffHeader = lines.slice(0, diffHeaderEnd).join('\n') + '\n'
    const hunks = parseHunks(lines, diffHeaderEnd, diffHeader)

    files.push({
      filePath: path.resolve(root, relativePath),
      relativePath,
      status,
      hunks,
      oldPath,
    })
  }
  return files
}
