/**
 * useTerminalCompletions — Tab completion (files, git branches, git subcommands)
 * and completion overlay state management.
 */

import { useEffect, useRef, useCallback, useState } from 'react'
import type { Completion } from './CompletionOverlay'

// ── Git subcommand list (shared constant) ───────────────────────────────────
const GIT_SUBCMDS = [
  'add', 'commit', 'push', 'pull', 'checkout', 'branch', 'merge',
  'rebase', 'status', 'log', 'diff', 'stash', 'fetch', 'clone',
  'init', 'remote', 'reset', 'restore', 'tag',
]

export interface CompletionState {
  completions: Completion[]
  setCompletions: React.Dispatch<React.SetStateAction<Completion[]>>
  completionVisible: boolean
  setCompletionVisible: React.Dispatch<React.SetStateAction<boolean>>
  completionIndex: number
  setCompletionIndex: React.Dispatch<React.SetStateAction<number>>
  completionPos: { x: number; y: number }
  setCompletionPos: React.Dispatch<React.SetStateAction<{ x: number; y: number }>>
  /** Ref versions so onKey closure always sees current values */
  completionVisibleRef: React.MutableRefObject<boolean>
  completionIndexRef: React.MutableRefObject<number>
  completionsRef: React.MutableRefObject<Completion[]>
}

export interface CompletionActions {
  applyCompletion: (value: string, type: string) => void
  handleTabCompletion: () => Promise<void>
  handleTabCompletionRef: React.MutableRefObject<(() => Promise<void>) | null>
}

interface UseTerminalCompletionsParams {
  sessionId: string
  currentLineRef: React.MutableRefObject<string>
  isHistorySuggestionRef: React.MutableRefObject<boolean>
  cwd?: string
}

export interface UseTerminalCompletionsResult {
  state: CompletionState
  actions: CompletionActions
}

export function useTerminalCompletions(
  params: UseTerminalCompletionsParams,
): UseTerminalCompletionsResult {
  const { sessionId, currentLineRef, isHistorySuggestionRef, cwd } = params

  const [completions, setCompletions] = useState<Completion[]>([])
  const [completionVisible, setCompletionVisible] = useState(false)
  const [completionIndex, setCompletionIndex] = useState(0)
  const [completionPos, setCompletionPos] = useState({ x: 0, y: 0 })

  const completionVisibleRef = useRef(false)
  const completionIndexRef = useRef(0)
  const completionsRef = useRef<Completion[]>([])
  const cwdRef = useRef(cwd ?? '')
  const handleTabCompletionRef = useRef<(() => Promise<void>) | null>(null)

  useEffect(() => { cwdRef.current = cwd ?? '' }, [cwd])
  useEffect(() => { completionVisibleRef.current = completionVisible }, [completionVisible])
  useEffect(() => { completionIndexRef.current = completionIndex }, [completionIndex])
  useEffect(() => { completionsRef.current = completions }, [completions])

  const generateCompletions = useCallback(async (
    line: string,
    word: string,
    cwd_: string,
  ): Promise<Completion[]> => {
    // Git branch completion
    if (/\bgit\s+(checkout|merge|rebase|diff|branch)\s+\S*$/.test(line)) {
      return generateGitBranchCompletions(word, cwd_)
    }
    // Git subcommand completion
    if (/^git\s+\S*$/.test(line.trim())) {
      return generateGitSubcmdCompletions(word)
    }
    // File path completion
    if (word.length > 0) {
      return generateFileCompletions(word, cwd_)
    }
    return []
  }, [])

  const applyCompletion = useCallback((value: string, type: string) => {
    if (type === 'cmd') {
      void window.electronAPI.pty.write(sessionId, '\x15' + value)
      currentLineRef.current = value
    } else {
      const line = currentLineRef.current
      const word = line.split(/\s+/).pop() ?? ''
      const suffix = value.slice(word.length)
      const trailer = type === 'dir' ? '/' : ' '
      void window.electronAPI.pty.write(sessionId, suffix + trailer)
      currentLineRef.current = line + suffix + trailer
    }
    completionVisibleRef.current = false
    isHistorySuggestionRef.current = false
    setCompletionVisible(false)
    setCompletions([])
  }, [sessionId, currentLineRef, isHistorySuggestionRef])

  const handleTabCompletion = useCallback(async () => {
    isHistorySuggestionRef.current = false
    const cwdResult = await window.electronAPI.pty.getCwd(sessionId)
    if (cwdResult.success && cwdResult.cwd) {
      cwdRef.current = cwdResult.cwd
    }

    const line = currentLineRef.current
    const word = line.split(/\s+/).pop() ?? ''
    const suggestions = await generateCompletions(line, word, cwdRef.current)

    if (suggestions.length === 0) return

    if (suggestions.length === 1) {
      const [completion] = suggestions
      const suffix = completion.value.slice(word.length)
      const trailer = completion.type === 'dir' ? '/' : ' '
      void window.electronAPI.pty.write(sessionId, suffix + trailer)
      currentLineRef.current = line + suffix + trailer
      return
    }

    showCompletionPopup(suggestions)
  }, [sessionId, generateCompletions, currentLineRef, isHistorySuggestionRef])

  useEffect(() => {
    handleTabCompletionRef.current = handleTabCompletion
  }, [handleTabCompletion])

  return {
    state: {
      completions, setCompletions,
      completionVisible, setCompletionVisible,
      completionIndex, setCompletionIndex,
      completionPos, setCompletionPos,
      completionVisibleRef, completionIndexRef, completionsRef,
    },
    actions: { applyCompletion, handleTabCompletion, handleTabCompletionRef },
  }

  // ── Internal helpers ──────────────────────────────────────────────────
  function showCompletionPopup(suggestions: Completion[]): void {
    setCompletions(suggestions)
    completionsRef.current = suggestions
    setCompletionIndex(0)
    completionIndexRef.current = 0
    setCompletionVisible(true)
    completionVisibleRef.current = true
    setCompletionPos({ x: 8, y: 40 })
  }
}

// ── Pure completion generators ──────────────────────────────────────────────

async function generateGitBranchCompletions(
  word: string, cwd_: string,
): Promise<Completion[]> {
  const result = await window.electronAPI.git.branches(cwd_)
  if (!result.success || !result.branches) return []
  const matches: Completion[] = []
  for (const b of result.branches) {
    if (b.startsWith(word)) matches.push({ value: b, type: 'branch' })
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
  word: string, cwd_: string,
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
  dirPart: string, cwd_: string, sep: string,
): string {
  if (!dirPart) return cwd_
  const isAbsolute = dirPart.startsWith('/') || /^[A-Za-z]:/.test(dirPart)
  return isAbsolute ? dirPart : cwd_ + sep + dirPart
}
