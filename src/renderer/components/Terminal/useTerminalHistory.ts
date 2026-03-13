/**
 * useTerminalHistory — manages shell history loading, Fuse fuzzy search index,
 * inline history suggestions (as-you-type), and Up/Down arrow history navigation.
 */

import { useEffect, useRef, useCallback, useState } from 'react'
import Fuse from 'fuse.js'
import type { Completion } from './CompletionOverlay'

export interface HistoryRefs {
  /** Commands in newest-first order (index 0 = most recent) */
  historyRef: React.MutableRefObject<string[]>
  /** Current position in history; -1 = not navigating */
  histPosRef: React.MutableRefObject<number>
  /** Tracks the line currently being typed (before history nav) */
  currentLineRef: React.MutableRefObject<string>
  /** Commands gathered from OSC 133 B sequences in this session */
  sessionCommandsRef: React.MutableRefObject<string[]>
}

export interface HistorySuggestionControls {
  searchHistorySuggestions: (input: string) => void
  searchHistorySuggestionsRef: React.MutableRefObject<((input: string) => void) | null>
  /** Whether the current completion popup is showing history suggestions */
  isHistorySuggestionRef: React.MutableRefObject<boolean>
}

export interface CommandSearchState {
  showCmdSearch: boolean
  setShowCmdSearch: React.Dispatch<React.SetStateAction<boolean>>
  cmdHistory: string[]
  setCmdHistory: React.Dispatch<React.SetStateAction<string[]>>
}

interface UseTerminalHistoryParams {
  /** Setters for completion overlay state (shared with Tab completions) */
  setCompletions: React.Dispatch<React.SetStateAction<Completion[]>>
  setCompletionIndex: React.Dispatch<React.SetStateAction<number>>
  setCompletionVisible: React.Dispatch<React.SetStateAction<boolean>>
  setCompletionPos: React.Dispatch<React.SetStateAction<{ x: number; y: number }>>
  completionVisibleRef: React.MutableRefObject<boolean>
  completionIndexRef: React.MutableRefObject<number>
  completionsRef: React.MutableRefObject<Completion[]>
}

export interface UseTerminalHistoryResult {
  historyRefs: HistoryRefs
  suggestionControls: HistorySuggestionControls
  cmdSearch: CommandSearchState
}

export function useTerminalHistory(params: UseTerminalHistoryParams): UseTerminalHistoryResult {
  const {
    setCompletions,
    setCompletionIndex,
    setCompletionVisible,
    setCompletionPos,
    completionVisibleRef,
    completionIndexRef,
    completionsRef,
  } = params

  // ── App-level command history (Up/Down arrow navigation) ───────────────
  const historyRef = useRef<string[]>([])
  const histPosRef = useRef<number>(-1)
  const currentLineRef = useRef<string>('')
  const sessionCommandsRef = useRef<string[]>([])

  // ── Command search (Ctrl+R) state ─────────────────────────────────────
  const [showCmdSearch, setShowCmdSearch] = useState(false)
  const [cmdHistory, setCmdHistory] = useState<string[]>([])

  // ── Inline history suggestions (as-you-type) ─────────────────────────
  const shellHistoryRef = useRef<string[]>([])
  const fuseRef = useRef<Fuse<string> | null>(null)
  const histSuggestDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isHistorySuggestionRef = useRef(false)

  // ── Load shell history and build Fuse index ──────────────────────────
  useEffect(() => {
    void window.electronAPI.shellHistory.read().then((result) => {
      const commands = result.commands ?? []
      const seen = new Set<string>()
      const deduped: string[] = []
      for (const c of commands) {
        if (c && !seen.has(c)) {
          seen.add(c)
          deduped.push(c)
        }
      }
      shellHistoryRef.current = deduped
      fuseRef.current = new Fuse(deduped, {
        threshold: 0.4,
        distance: 100,
        minMatchCharLength: 2,
        includeScore: true,
      })
    })
  }, [])

  // ── Search history and show inline suggestions ────────────────────────
  const searchHistorySuggestions = useCallback((input: string) => {
    clearPreviousDebounce()
    if (!shouldShowSuggestions(input)) return
    if (completionVisibleRef.current && !isHistorySuggestionRef.current) return

    histSuggestDebounceRef.current = setTimeout(() => {
      histSuggestDebounceRef.current = null
      performFuseSearch(input.trim())
    }, 150)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const searchHistorySuggestionsRef = useRef<((input: string) => void) | null>(null)
  useEffect(() => {
    searchHistorySuggestionsRef.current = searchHistorySuggestions
  }, [searchHistorySuggestions])

  // ── Clean up debounce on unmount ──────────────────────────────────────
  useEffect(() => {
    return () => {
      if (histSuggestDebounceRef.current !== null) {
        clearTimeout(histSuggestDebounceRef.current)
      }
    }
  }, [])

  return {
    historyRefs: { historyRef, histPosRef, currentLineRef, sessionCommandsRef },
    suggestionControls: {
      searchHistorySuggestions,
      searchHistorySuggestionsRef,
      isHistorySuggestionRef,
    },
    cmdSearch: { showCmdSearch, setShowCmdSearch, cmdHistory, setCmdHistory },
  }

  // ── Helpers (hoisted for readability) ─────────────────────────────────

  function clearPreviousDebounce(): void {
    if (histSuggestDebounceRef.current !== null) {
      clearTimeout(histSuggestDebounceRef.current)
      histSuggestDebounceRef.current = null
    }
  }

  function shouldShowSuggestions(input: string): boolean {
    if (input.trim().length < 2) {
      if (isHistorySuggestionRef.current) {
        dismissSuggestions()
      }
      return false
    }
    return true
  }

  function dismissSuggestions(): void {
    setCompletionVisible(false)
    completionVisibleRef.current = false
    setCompletions([])
    isHistorySuggestionRef.current = false
  }

  function performFuseSearch(trimmed: string): void {
    const fuse = fuseRef.current
    if (!fuse) return

    const results = fuse.search(trimmed, { limit: 8 })
    const suggestions: Completion[] = results
      .filter((r) => r.item !== trimmed)
      .map((r) => ({ value: r.item, type: 'cmd' as const }))

    if (suggestions.length === 0) {
      if (isHistorySuggestionRef.current) dismissSuggestions()
      return
    }

    setCompletions(suggestions)
    completionsRef.current = suggestions
    setCompletionIndex(0)
    completionIndexRef.current = 0
    setCompletionVisible(true)
    completionVisibleRef.current = true
    isHistorySuggestionRef.current = true
    setCompletionPos({ x: 8, y: 40 })
  }
}
