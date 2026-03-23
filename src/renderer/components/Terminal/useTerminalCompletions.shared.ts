import type React from 'react'

import type { Completion } from './CompletionOverlay'

const COMPLETION_POPUP_POS = { x: 8, y: 40 }

const GIT_SUBCMDS = [
  'add', 'commit', 'push', 'pull', 'checkout', 'branch', 'merge',
  'rebase', 'status', 'log', 'diff', 'stash', 'fetch', 'clone',
  'init', 'remote', 'reset', 'restore', 'tag',
]

export function getCurrentWord(line: string): string {
  return line.split(/\s+/).pop() ?? ''
}

export function appendCompletionValue(
  sessionId: string,
  currentLineRef: React.MutableRefObject<string>,
  value: string,
  type: string,
): void {
  const line = currentLineRef.current
  const word = getCurrentWord(line)
  const suffix = value.slice(word.length)
  const trailer = type === 'dir' ? '/' : ' '

  void window.electronAPI.pty.write(sessionId, suffix + trailer)
  currentLineRef.current = line + suffix + trailer
}

export function dismissCompletionPopup(params: {
  completionVisibleRef: React.MutableRefObject<boolean>
  completionsRef: React.MutableRefObject<Completion[]>
  isHistorySuggestionRef: React.MutableRefObject<boolean>
  setCompletions: React.Dispatch<React.SetStateAction<Completion[]>>
  setCompletionVisible: React.Dispatch<React.SetStateAction<boolean>>
}): void {
  params.completionVisibleRef.current = false
  params.completionsRef.current = []
  params.isHistorySuggestionRef.current = false
  params.setCompletionVisible(false)
  params.setCompletions([])
}

export async function syncCwd(
  sessionId: string,
  cwdRef: React.MutableRefObject<string>,
): Promise<void> {
  const cwdResult = await window.electronAPI.pty.getCwd(sessionId)
  if (cwdResult.success && cwdResult.cwd) {
    cwdRef.current = cwdResult.cwd
  }
}

export function showCompletionPopup(params: {
  suggestions: Completion[]
  completionIndexRef: React.MutableRefObject<number>
  completionVisibleRef: React.MutableRefObject<boolean>
  completionsRef: React.MutableRefObject<Completion[]>
  setCompletions: React.Dispatch<React.SetStateAction<Completion[]>>
  setCompletionIndex: React.Dispatch<React.SetStateAction<number>>
  setCompletionPos: React.Dispatch<React.SetStateAction<{ x: number; y: number }>>
  setCompletionVisible: React.Dispatch<React.SetStateAction<boolean>>
}): void {
  params.setCompletions(params.suggestions)
  params.completionsRef.current = params.suggestions
  params.setCompletionIndex(0)
  params.completionIndexRef.current = 0
  params.setCompletionVisible(true)
  params.completionVisibleRef.current = true
  params.setCompletionPos(COMPLETION_POPUP_POS)
}

export async function generateCompletions(
  line: string,
  word: string,
  cwd_: string,
): Promise<Completion[]> {
  if (/\bgit\s+(checkout|merge|rebase|diff|branch)\s+\S*$/.test(line)) {
    return generateGitBranchCompletions(word, cwd_)
  }

  if (/^git\s+\S*$/.test(line.trim())) {
    return generateGitSubcmdCompletions(word)
  }

  if (word.length > 0) {
    return generateFileCompletions(word, cwd_)
  }

  return []
}

async function generateGitBranchCompletions(
  word: string,
  cwd_: string,
): Promise<Completion[]> {
  const result = await window.electronAPI.git.branches(cwd_)
  if (!result.success || !result.branches) return []

  const matches: Completion[] = []
  for (const branch of result.branches) {
    if (branch.startsWith(word)) matches.push({ value: branch, type: 'branch' })
  }

  return matches.slice(0, 20)
}

function generateGitSubcmdCompletions(word: string): Completion[] {
  const matches: Completion[] = []
  for (const cmd of GIT_SUBCMDS) {
    if (cmd.startsWith(word)) matches.push({ value: cmd, type: 'git-subcmd' })
  }
  return matches
}

async function generateFileCompletions(
  word: string,
  cwd_: string,
): Promise<Completion[]> {
  const sep = cwd_.includes('\\') ? '\\' : '/'
  const lastSep = Math.max(word.lastIndexOf('/'), word.lastIndexOf('\\'))
  const dirPart = lastSep >= 0 ? word.slice(0, lastSep + 1) : ''
  const filePart = lastSep >= 0 ? word.slice(lastSep + 1) : word

  const searchDir = resolveSearchDir(dirPart, cwd_, sep)
  const dirResult = await window.electronAPI.files.readDir(searchDir)
  if (!dirResult.success || !dirResult.items) return []

  const results: Completion[] = []
  for (const item of dirResult.items) {
    if (item.name.startsWith(filePart) && !item.name.startsWith('.')) {
      results.push({
        value: dirPart + item.name,
        type: item.isDirectory ? 'dir' : 'file',
      })
    }
  }

  return results.slice(0, 20)
}

function resolveSearchDir(
  dirPart: string,
  cwd_: string,
  sep: string,
): string {
  if (!dirPart) return cwd_
  const isAbsolute = dirPart.startsWith('/') || /^[A-Za-z]:/.test(dirPart)
  return isAbsolute ? dirPart : cwd_ + sep + dirPart
}
