/**
 * ipc-handlers/git.ts — Git IPC handlers
 */

import { ipcMain, app, IpcMainInvokeEvent, BrowserWindow } from 'electron'
import { execFile } from 'child_process'
import fs from 'fs/promises'
import path from 'path'
import { dispatchActivationEvent } from '../extensions'

type SenderWindow = (event: IpcMainInvokeEvent) => BrowserWindow

/** Default timeout for git operations (30 seconds) */
const GIT_TIMEOUT_MS = 30_000

/** Wrapper around execFile that adds a timeout. */
function gitExec(
  args: string[],
  opts: { cwd: string; maxBuffer?: number },
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(
      'git',
      args,
      { ...opts, timeout: GIT_TIMEOUT_MS, maxBuffer: opts.maxBuffer ?? 1024 * 1024 },
      (err, stdout, stderr) => {
        if (err) {
          reject(err)
        } else {
          resolve({ stdout, stderr })
        }
      },
    )
  })
}

// ─── Unified diff parser ─────────────────────────────────────────────────────

interface ParsedHunk {
  header: string
  oldStart: number
  oldCount: number
  newStart: number
  newCount: number
  lines: string[]
  rawPatch: string
}

interface ParsedFileDiff {
  filePath: string
  relativePath: string
  status: 'modified' | 'added' | 'deleted' | 'renamed'
  hunks: ParsedHunk[]
  oldPath?: string
}

function parseDiffOutput(diffText: string, root: string): ParsedFileDiff[] {
  if (!diffText.trim()) return []

  const files: ParsedFileDiff[] = []
  // Split on "diff --git" boundaries
  const fileDiffs = diffText.split(/^(?=diff --git )/m).filter(Boolean)

  for (const fileDiff of fileDiffs) {
    const lines = fileDiff.split('\n')
    if (lines.length === 0) continue

    // Parse the "diff --git a/path b/path" header
    const headerMatch = lines[0].match(/^diff --git a\/(.+?) b\/(.+)$/)
    if (!headerMatch) continue

    const aPath = headerMatch[1]
    const bPath = headerMatch[2]
    const relativePath = bPath

    // Determine file status from the index/mode lines
    let status: 'modified' | 'added' | 'deleted' | 'renamed' = 'modified'
    let oldPath: string | undefined

    for (const line of lines.slice(1, 6)) {
      if (line.startsWith('new file mode')) {
        status = 'added'
      } else if (line.startsWith('deleted file mode')) {
        status = 'deleted'
      } else if (line.startsWith('rename from')) {
        status = 'renamed'
        oldPath = line.replace('rename from ', '')
      }
    }

    if (aPath !== bPath && !oldPath) {
      status = 'renamed'
      oldPath = aPath
    }

    // Find diff header block (everything before the first hunk) for rawPatch prefix
    let diffHeaderEnd = 0
    for (let i = 1; i < lines.length; i++) {
      if (lines[i].startsWith('@@')) {
        diffHeaderEnd = i
        break
      }
    }
    // If no hunks found, diffHeaderEnd stays 0 — the file might be binary or empty
    const diffHeader = lines.slice(0, diffHeaderEnd).join('\n') + '\n'

    // Parse hunks
    const hunks: ParsedHunk[] = []
    let i = diffHeaderEnd

    while (i < lines.length) {
      if (lines[i].startsWith('@@')) {
        const hunkHeader = lines[i]
        const hunkMatch = hunkHeader.match(/@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/)
        if (!hunkMatch) { i++; continue }

        const oldStart = parseInt(hunkMatch[1], 10)
        const oldCount = hunkMatch[2] !== undefined ? parseInt(hunkMatch[2], 10) : 1
        const newStart = parseInt(hunkMatch[3], 10)
        const newCount = hunkMatch[4] !== undefined ? parseInt(hunkMatch[4], 10) : 1

        // Collect all lines belonging to this hunk
        const hunkLines: string[] = []
        i++
        while (i < lines.length && !lines[i].startsWith('@@') && !lines[i].startsWith('diff --git')) {
          hunkLines.push(lines[i])
          i++
        }

        // Build rawPatch: diff header + this single hunk (for git apply)
        const rawPatch = diffHeader + hunkHeader + '\n' + hunkLines.join('\n') + '\n'

        hunks.push({
          header: hunkHeader,
          oldStart,
          oldCount,
          newStart,
          newCount,
          lines: hunkLines,
          rawPatch,
        })
      } else {
        i++
      }
    }

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

export function registerGitHandlers(_senderWindow: SenderWindow): string[] {
  const channels: string[] = []

  ipcMain.handle('git:isRepo', async (_event, root: string) => {
    try {
      await gitExec(['rev-parse', '--git-dir'], { cwd: root })
      return { success: true, isRepo: true }
    } catch {
      return { success: true, isRepo: false }
    }
  })
  channels.push('git:isRepo')

  ipcMain.handle('git:status', async (_event, root: string) => {
    try {
      const { stdout } = await gitExec(
        ['status', '--porcelain=v1'],
        { cwd: root, maxBuffer: 1024 * 1024 },
      )

      const files: Record<string, string> = {}
      const lines = stdout.split('\n').filter((l) => l.length > 0)

      for (const line of lines) {
        const indexStatus = line[0]
        const workTreeStatus = line[1]
        let filePath = line.slice(3)

        // Handle renames: "R  old -> new"
        const arrowIdx = filePath.indexOf(' -> ')
        if (arrowIdx !== -1) {
          filePath = filePath.slice(arrowIdx + 4)
        }

        // Normalise path separators
        filePath = filePath.replace(/\\/g, '/')

        // Determine the effective status
        let status: string
        if (indexStatus === '?' && workTreeStatus === '?') {
          status = '?'
        } else if (indexStatus === 'R' || workTreeStatus === 'R') {
          status = 'R'
        } else if (indexStatus === 'A' || workTreeStatus === 'A') {
          status = 'A'
        } else if (indexStatus === 'D' || workTreeStatus === 'D') {
          status = 'D'
        } else if (
          indexStatus === 'M' ||
          workTreeStatus === 'M' ||
          indexStatus === 'U' ||
          workTreeStatus === 'U'
        ) {
          status = 'M'
        } else {
          status = 'M' // fallback for any other combo
        }

        files[filePath] = status
      }

      return { success: true, files }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })
  channels.push('git:status')

  ipcMain.handle('git:branch', async (_event, root: string) => {
    try {
      const { stdout } = await gitExec(
        ['rev-parse', '--abbrev-ref', 'HEAD'],
        { cwd: root },
      )
      return { success: true, branch: stdout.trim() }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })
  channels.push('git:branch')

  ipcMain.handle('git:diff', async (_event, root: string, filePath: string) => {
    try {
      const { stdout } = await gitExec(
        ['diff', 'HEAD', '--', filePath],
        { cwd: root, maxBuffer: 1024 * 1024 * 4 },
      )

      const diffLines: Array<{ line: number; kind: string }> = []

      // Parse unified diff to extract line info
      const hunks = stdout.split(/^@@\s/m)
      for (let h = 1; h < hunks.length; h++) {
        const hunk = hunks[h]
        // Parse hunk header: -oldStart[,oldCount] +newStart[,newCount] @@
        const headerMatch = hunk.match(
          /^-(\d+)(?:,(\d+))?\s\+(\d+)(?:,(\d+))?\s@@/
        )
        if (!headerMatch) continue

        const oldCount = headerMatch[2] != null ? parseInt(headerMatch[2], 10) : 1
        const newStart = parseInt(headerMatch[3], 10)

        // Get the lines after the header
        const headerEnd = hunk.indexOf('\n')
        if (headerEnd === -1) continue
        const body = hunk.slice(headerEnd + 1)
        const bodyLines = body.split('\n')

        let newLine = newStart
        let oldLine = parseInt(headerMatch[1], 10)
        // Track which new-side lines had a preceding removal to detect modifications
        const removedOldLines = new Set<number>()

        // First pass: collect removed old line numbers
        let tmpOld = oldLine
        for (const bl of bodyLines) {
          if (bl.startsWith('-')) {
            removedOldLines.add(tmpOld)
            tmpOld++
          } else if (bl.startsWith('+')) {
            // skip
          } else if (!bl.startsWith('\\')) {
            tmpOld++
          }
        }

        // Second pass: classify each line
        let curOld = oldLine
        let consecutiveRemoves = 0
        for (const bl of bodyLines) {
          if (bl.startsWith('-')) {
            consecutiveRemoves++
            curOld++
          } else if (bl.startsWith('+')) {
            if (consecutiveRemoves > 0) {
              // This addition replaces a removal => modified
              diffLines.push({ line: newLine, kind: 'modified' })
              consecutiveRemoves--
            } else {
              diffLines.push({ line: newLine, kind: 'added' })
            }
            newLine++
          } else if (bl.startsWith('\\')) {
            // "No newline at end of file" — ignore
          } else {
            // Context line — flush any remaining removals as deletions
            if (consecutiveRemoves > 0) {
              // Mark deletion at the line before (the context line)
              diffLines.push({ line: newLine, kind: 'deleted' })
              consecutiveRemoves = 0
            }
            newLine++
            curOld++
          }
        }

        // Flush trailing removals (deletions at end of hunk)
        if (consecutiveRemoves > 0) {
          diffLines.push({ line: newLine > newStart ? newLine - 1 : newLine, kind: 'deleted' })
        }
      }

      return { success: true, lines: diffLines }
    } catch {
      // Could be a new untracked file or not a git repo — return empty
      return { success: true, lines: [] }
    }
  })
  channels.push('git:diff')

  ipcMain.handle('git:log', async (_event, root: string, filePath: string, offset: number = 0) => {
    try {
      const { stdout } = await gitExec(
        [
          'log',
          '--pretty=format:%H|%an|%ae|%ad|%s',
          '--date=short',
          '-n', '50',
          `--skip=${offset}`,
          '--',
          filePath,
        ],
        { cwd: root, maxBuffer: 1024 * 1024 * 2 },
      )

      const commits: Array<{
        hash: string
        author: string
        email: string
        date: string
        message: string
      }> = []

      const lines = stdout.split('\n').filter((l) => l.trim().length > 0)
      for (const line of lines) {
        const idx1 = line.indexOf('|')
        const idx2 = line.indexOf('|', idx1 + 1)
        const idx3 = line.indexOf('|', idx2 + 1)
        const idx4 = line.indexOf('|', idx3 + 1)
        if (idx1 === -1 || idx2 === -1 || idx3 === -1 || idx4 === -1) continue
        commits.push({
          hash: line.slice(0, idx1),
          author: line.slice(idx1 + 1, idx2),
          email: line.slice(idx2 + 1, idx3),
          date: line.slice(idx3 + 1, idx4),
          message: line.slice(idx4 + 1),
        })
      }

      return { success: true, commits }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })
  channels.push('git:log')

  ipcMain.handle('git:show', async (_event, root: string, hash: string, filePath: string) => {
    try {
      const { stdout } = await gitExec(
        ['show', `${hash}`, '--', filePath],
        { cwd: root, maxBuffer: 1024 * 1024 * 4 },
      )
      return { success: true, patch: stdout }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })
  channels.push('git:show')

  ipcMain.handle('git:branches', async (_event, root: string) => {
    try {
      const { stdout } = await gitExec(
        ['branch', '-a', '--format=%(refname:short)'],
        { cwd: root, maxBuffer: 1024 * 1024 },
      )
      const branches = stdout
        .split('\n')
        .map((b) => b.trim())
        .filter((b) => b.length > 0)
      return { success: true, branches }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })
  channels.push('git:branches')

  ipcMain.handle('git:checkout', async (_event, root: string, branch: string) => {
    try {
      await gitExec(['checkout', branch], { cwd: root })
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.stderr?.trim() || err.message }
    }
  })
  channels.push('git:checkout')

  ipcMain.handle('git:stage', async (_event, root: string, filePath: string) => {
    try {
      await gitExec(['add', filePath], { cwd: root })
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.stderr?.trim() || err.message }
    }
  })
  channels.push('git:stage')

  ipcMain.handle('git:unstage', async (_event, root: string, filePath: string) => {
    try {
      await gitExec(['restore', '--staged', filePath], { cwd: root })
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.stderr?.trim() || err.message }
    }
  })
  channels.push('git:unstage')

  // ─── Git panel handlers ────────────────────────────────────────────────────

  ipcMain.handle('git:statusDetailed', async (_event, root: string) => {
    try {
      const { stdout } = await gitExec(
        ['status', '--porcelain=v1'],
        { cwd: root, maxBuffer: 1024 * 1024 },
      )

      const staged: Record<string, string> = {}
      const unstaged: Record<string, string> = {}
      const lines = stdout.split('\n').filter((l) => l.length > 0)

      for (const line of lines) {
        const indexStatus = line[0]
        const workTreeStatus = line[1]
        let filePath = line.slice(3)

        // Handle renames: "R  old -> new"
        const arrowIdx = filePath.indexOf(' -> ')
        if (arrowIdx !== -1) {
          filePath = filePath.slice(arrowIdx + 4)
        }

        // Normalise path separators
        filePath = filePath.replace(/\\/g, '/')

        // Index (staged) status
        if (indexStatus !== ' ' && indexStatus !== '?') {
          staged[filePath] = indexStatus
        }

        // Worktree (unstaged) status
        if (workTreeStatus !== ' ' && workTreeStatus !== undefined) {
          if (indexStatus === '?' && workTreeStatus === '?') {
            unstaged[filePath] = '?'
          } else if (workTreeStatus !== '?') {
            unstaged[filePath] = workTreeStatus
          }
        }
      }

      return { success: true, staged, unstaged }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })
  channels.push('git:statusDetailed')

  ipcMain.handle('git:commit', async (_event, root: string, message: string) => {
    try {
      await gitExec(['commit', '-m', message], { cwd: root })
      // Dispatch extension activation event for git commit
      dispatchActivationEvent('onGitCommit', { root, message }).catch(() => {})
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.stderr?.trim() || err.message }
    }
  })
  channels.push('git:commit')

  ipcMain.handle('git:stageAll', async (_event, root: string) => {
    try {
      await gitExec(['add', '-A'], { cwd: root })
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.stderr?.trim() || err.message }
    }
  })
  channels.push('git:stageAll')

  ipcMain.handle('git:unstageAll', async (_event, root: string) => {
    try {
      await gitExec(['reset', 'HEAD'], { cwd: root })
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.stderr?.trim() || err.message }
    }
  })
  channels.push('git:unstageAll')

  ipcMain.handle('git:discardFile', async (_event, root: string, filePath: string) => {
    try {
      // First check if the file is tracked
      await gitExec(['ls-files', '--error-unmatch', filePath], { cwd: root })
      // File is tracked — checkout from HEAD
      try {
        await gitExec(['checkout', 'HEAD', '--', filePath], { cwd: root })
        return { success: true }
      } catch (err: any) {
        return { success: false, error: err.stderr?.trim() || err.message }
      }
    } catch {
      // File is untracked — remove it
      try {
        const fullPath = path.resolve(root, filePath)
        await fs.unlink(fullPath)
        return { success: true }
      } catch (unlinkErr: any) {
        return { success: false, error: unlinkErr.message }
      }
    }
  })
  channels.push('git:discardFile')

  // ─── Diff Review handlers ──────────────────────────────────────────────────

  ipcMain.handle('git:snapshot', async (_event, root: string) => {
    try {
      const { stdout } = await gitExec(['rev-parse', 'HEAD'], { cwd: root })
      return { success: true, commitHash: stdout.trim() }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })
  channels.push('git:snapshot')

  ipcMain.handle('git:diffReview', async (_event, root: string, commitHash: string) => {
    try {
      const { stdout } = await gitExec(
        ['diff', commitHash, '--unified=3', '--no-color'],
        { cwd: root, maxBuffer: 1024 * 1024 * 10 },
      )

      const files = parseDiffOutput(stdout, root)
      return { success: true, files }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })
  channels.push('git:diffReview')

  ipcMain.handle('git:fileAtCommit', async (_event, root: string, commitHash: string, filePath: string) => {
    try {
      // Convert absolute path to relative for git show
      const relPath = path.relative(root, filePath).replace(/\\/g, '/')
      const { stdout } = await gitExec(
        ['show', `${commitHash}:${relPath}`],
        { cwd: root, maxBuffer: 1024 * 1024 * 4 },
      )
      return { success: true, content: stdout }
    } catch {
      // File didn't exist at that commit (new file)
      return { success: true, content: '' }
    }
  })
  channels.push('git:fileAtCommit')

  ipcMain.handle('git:applyHunk', async (_event, root: string, patchContent: string) => {
    const tmpFile = path.join(app.getPath('temp'), `ouroboros-hunk-${Date.now()}.patch`)
    try {
      await fs.writeFile(tmpFile, patchContent, 'utf-8')
      try {
        await gitExec(['apply', '--whitespace=nowarn', tmpFile], { cwd: root })
        return { success: true }
      } catch (err: any) {
        return { success: false, error: err.stderr?.trim() || err.message }
      } finally {
        void fs.unlink(tmpFile).catch(() => {})
      }
    } catch (writeErr) {
      return { success: false, error: writeErr instanceof Error ? writeErr.message : String(writeErr) }
    }
  })
  channels.push('git:applyHunk')

  ipcMain.handle('git:revertHunk', async (_event, root: string, patchContent: string) => {
    const tmpFile = path.join(app.getPath('temp'), `ouroboros-hunk-${Date.now()}.patch`)
    try {
      await fs.writeFile(tmpFile, patchContent, 'utf-8')
      try {
        await gitExec(['apply', '-R', '--whitespace=nowarn', tmpFile], { cwd: root })
        return { success: true }
      } catch (err: any) {
        return { success: false, error: err.stderr?.trim() || err.message }
      } finally {
        void fs.unlink(tmpFile).catch(() => {})
      }
    } catch (writeErr) {
      return { success: false, error: writeErr instanceof Error ? writeErr.message : String(writeErr) }
    }
  })
  channels.push('git:revertHunk')

  ipcMain.handle('git:revertFile', async (_event, root: string, commitHash: string, filePath: string) => {
    try {
      await gitExec(['checkout', commitHash, '--', filePath], { cwd: root })
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.stderr?.trim() || err.message }
    }
  })
  channels.push('git:revertFile')

  // ─── Time-travel handlers ──────────────────────────────────────────────────

  ipcMain.handle('git:diffBetween', async (_event, root: string, fromHash: string, toHash: string) => {
    try {
      const { stdout } = await gitExec(
        ['diff', fromHash, toHash, '--unified=3', '--no-color'],
        { cwd: root, maxBuffer: 1024 * 1024 * 10 },
      )
      const files = parseDiffOutput(stdout, root)
      return { success: true, files }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })
  channels.push('git:diffBetween')

  ipcMain.handle('git:changedFilesBetween', async (_event, root: string, fromHash: string, toHash: string) => {
    try {
      const { stdout } = await gitExec(
        ['diff', '--numstat', fromHash, toHash],
        { cwd: root, maxBuffer: 1024 * 1024 * 4 },
      )
      const files: Array<{ path: string; status: string; additions: number; deletions: number }> = []
      const lines = stdout.split('\n').filter((l) => l.trim().length > 0)
      for (const line of lines) {
        const parts = line.split('\t')
        if (parts.length < 3) continue
        const additions = parts[0] === '-' ? 0 : parseInt(parts[0], 10)
        const deletions = parts[1] === '-' ? 0 : parseInt(parts[1], 10)
        const filePath = parts[2]
        files.push({ path: filePath, status: 'modified', additions, deletions })
      }

      // Also get the name-status for accurate status (A/D/M/R)
      try {
        const { stdout: nsOut } = await gitExec(
          ['diff', '--name-status', fromHash, toHash],
          { cwd: root, maxBuffer: 1024 * 1024 * 4 },
        )
        const nsLines = nsOut.split('\n').filter((l) => l.trim().length > 0)
        const statusMap: Record<string, string> = {}
        for (const line of nsLines) {
          const tab = line.indexOf('\t')
          if (tab === -1) continue
          const statusChar = line.slice(0, tab).trim()
          const fp = line.slice(tab + 1).split('\t').pop() ?? ''
          let status = 'modified'
          if (statusChar.startsWith('A')) status = 'added'
          else if (statusChar.startsWith('D')) status = 'deleted'
          else if (statusChar.startsWith('R')) status = 'renamed'
          statusMap[fp] = status
        }
        for (const f of files) {
          if (statusMap[f.path]) f.status = statusMap[f.path]
        }
      } catch {
        // Non-fatal — keep default 'modified' status
      }

      return { success: true, files }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })
  channels.push('git:changedFilesBetween')

  ipcMain.handle('git:restoreSnapshot', async (_event, root: string, commitHash: string) => {
    try {
      // Count dirty files first
      let dirtyCount = 0
      let stashRef: string | undefined
      try {
        const { stdout: statusOut } = await gitExec(['status', '--porcelain'], { cwd: root })
        dirtyCount = statusOut.split('\n').filter((l) => l.trim().length > 0).length
      } catch {
        // ignore
      }

      // Save the current branch name before switching
      let previousBranch: string | undefined
      try {
        const { stdout: branchOut } = await gitExec(['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: root })
        previousBranch = branchOut.trim()
        // If already in detached HEAD, rev-parse returns "HEAD"
        if (previousBranch === 'HEAD') previousBranch = undefined
      } catch {
        // ignore
      }

      // Stash current changes if there are any
      if (dirtyCount > 0) {
        const stashMsg = `ouroboros-time-travel-${Date.now()}`
        await gitExec(['stash', 'push', '-m', stashMsg, '--include-untracked'], { cwd: root })
        try {
          const { stdout: stashList } = await gitExec(['stash', 'list', '--format=%gd %s', '-n', '1'], { cwd: root })
          const match = stashList.match(/^(stash@\{\d+\})/)
          if (match) stashRef = match[1]
        } catch {
          stashRef = 'stash@{0}'
        }
      }

      // Generate a branch name with compact timestamp
      const now = new Date()
      const ts = now.getFullYear().toString()
        + String(now.getMonth() + 1).padStart(2, '0')
        + String(now.getDate()).padStart(2, '0')
        + '-'
        + String(now.getHours()).padStart(2, '0')
        + String(now.getMinutes()).padStart(2, '0')
        + String(now.getSeconds()).padStart(2, '0')
      let branchName = `ouroboros/snapshot-${ts}`

      // Create and switch to a named branch at the snapshot commit
      try {
        await gitExec(['checkout', '-b', branchName, commitHash], { cwd: root })
      } catch {
        // Branch name already exists — append a short random suffix and retry
        const suffix = Math.random().toString(36).slice(2, 6)
        branchName = `ouroboros/snapshot-${ts}-${suffix}`
        await gitExec(['checkout', '-b', branchName, commitHash], { cwd: root })
      }

      return { success: true, stashRef, dirtyCount, branch: branchName, previousBranch }
    } catch (err: any) {
      return { success: false, error: err.stderr?.trim() || err.message }
    }
  })
  channels.push('git:restoreSnapshot')

  ipcMain.handle('git:createSnapshot', async (_event, root: string, label?: string) => {
    try {
      const msg = `[Ouroboros Snapshot] ${label?.trim() || 'Manual snapshot'}`
      await gitExec(['add', '-A'], { cwd: root })
      await gitExec(['commit', '--allow-empty', '-m', msg], { cwd: root })
      const { stdout } = await gitExec(['rev-parse', 'HEAD'], { cwd: root })
      return { success: true, commitHash: stdout.trim() }
    } catch (err: any) {
      return { success: false, error: err.stderr?.trim() || err.message }
    }
  })
  channels.push('git:createSnapshot')

  ipcMain.handle('git:dirtyCount', async (_event, root: string) => {
    try {
      const { stdout } = await gitExec(['status', '--porcelain'], { cwd: root })
      const count = stdout.split('\n').filter((l) => l.trim().length > 0).length
      return { success: true, count }
    } catch (err: any) {
      return { success: false, count: 0, error: err.message }
    }
  })
  channels.push('git:dirtyCount')

  ipcMain.handle('git:blame', async (_event, root: string, filePath: string) => {
    try {
      const { stdout } = await gitExec(
        ['blame', '--porcelain', filePath],
        { cwd: root, maxBuffer: 1024 * 1024 * 4 },
      )

      const result: Array<{
        hash: string
        author: string
        date: number
        summary: string
        line: number
      }> = []

      const commitInfo = new Map<
        string,
        { author: string; date: number; summary: string }
      >()

      const chunks = stdout.split('\n')
      let i = 0
      while (i < chunks.length) {
        const headerLine = chunks[i]
        // Header: <hash> <orig-line> <final-line> [<num-lines>]
        const headerMatch = headerLine.match(
          /^([0-9a-f]{40})\s+\d+\s+(\d+)/
        )
        if (!headerMatch) {
          i++
          continue
        }

        const hash = headerMatch[1]
        const finalLine = parseInt(headerMatch[2], 10)
        i++

        // Read metadata lines until we hit the content line (starts with \t)
        let author = ''
        let date = 0
        let summary = ''

        while (i < chunks.length && !chunks[i].startsWith('\t')) {
          const line = chunks[i]
          if (line.startsWith('author ')) {
            author = line.slice(7)
          } else if (line.startsWith('author-time ')) {
            date = parseInt(line.slice(12), 10)
          } else if (line.startsWith('summary ')) {
            summary = line.slice(8)
          }
          i++
        }

        // Skip the content line (starts with \t)
        if (i < chunks.length && chunks[i].startsWith('\t')) {
          i++
        }

        // Cache commit info
        if (author && !commitInfo.has(hash)) {
          commitInfo.set(hash, { author, date, summary })
        }

        // Use cached info if this line didn't have full headers
        const info = commitInfo.get(hash)
        result.push({
          hash,
          author: author || info?.author || 'Unknown',
          date: date || info?.date || 0,
          summary: summary || info?.summary || '',
          line: finalLine,
        })
      }

      return { success: true, lines: result }
    } catch {
      // File not tracked or not a git repo
      return { success: true, lines: [] }
    }
  })
  channels.push('git:blame')

  return channels
}
