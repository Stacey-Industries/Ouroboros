/**
 * useTerminalHistory â€” manages shell history loading, Fuse fuzzy search index,
 * inline history suggestions (as-you-type), and Up/Down arrow history navigation.
 */

import { useEffect, useRef, useCallback, useState } from 'react'
import Fuse from 'fuse.js'
import type { Completion } from './CompletionOverlay'

const HISTORY_SUGGESTION_POS = { x: 8, y: 40 }

interface SuggestionSearchIndex {
  fuseRef: React.MutableRefObject<Fuse<string> | null>
  histSuggestDebounceRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>
  isHistorySuggestionRef: React.MutableRefObject<boolean>
}

interface SuggestionSearchParams extends UseTerminalHistoryParams, SuggestionSearchIndex {}

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

function useHistoryRefs(): HistoryRefs {
  const historyRef = useRef<string[]>([])
  const histPosRef = useRef<number>(-1)
  const currentLineRef = useRef<string>('')
  const sessionCommandsRef = useRef<string[]>([])

  return { historyRef, histPosRef, currentLineRef, sessionCommandsRef }
}

function useCommandSearchState(): CommandSearchState {
  const [showCmdSearch, setShowCmdSearch] = useState(false)
  const [cmdHistory, setCmdHistory] = useState<string[]>([])

  return { showCmdSearch, setShowCmdSearch, cmdHistory, setCmdHistory }
}

function useSuggestionSearchIndex(): SuggestionSearchIndex {
  const fuseRef = useRef<Fuse<string> | null>(null)
  const histSuggestDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isHistorySuggestionRef = useRef(false)

  useEffect(() => {
    void window.electronAPI.shellHistory.read().then((result) => {
      const commands = dedupeCommands(result.commands ?? [])
      fuseRef.current = new Fuse(commands, {
        threshold: 0.4,
        distance: 100,
        minMatchCharLength: 2,
        includeScore: true,
      })
    })
  }, [])

  useEffect(() => () => clearPendingDebounce(histSuggestDebounceRef), [])

  return { fuseRef, histSuggestDebounceRef, isHistorySuggestionRef }
}

function useHistorySuggestionSearch(params: SuggestionSearchParams): HistorySuggestionControls {
  const { completionVisibleRef, histSuggestDebounceRef, isHistorySuggestionRef } = params

  const searchHistorySuggestions = useCallback((input: string) => {
    clearPendingDebounce(histSuggestDebounceRef)

    const trimmed = input.trim()
    if (trimmed.length < 2) {
      dismissHistorySuggestions(params)
      return
    }

    if (completionVisibleRef.current && !isHistorySuggestionRef.current) {
      return
    }

    histSuggestDebounceRef.current = setTimeout(() => {
      histSuggestDebounceRef.current = null
      performFuseSearch(trimmed, params)
    }, 150)
  }, [completionVisibleRef, histSuggestDebounceRef, isHistorySuggestionRef, params])

  const searchHistorySuggestionsRef = useRef<((input: string) => void) | null>(null)
  useEffect(() => {
    searchHistorySuggestionsRef.current = searchHistorySuggestions
  }, [searchHistorySuggestions])

  return { searchHistorySuggestions, searchHistorySuggestionsRef, isHistorySuggestionRef }
}

export function useTerminalHistory(params: UseTerminalHistoryParams): UseTerminalHistoryResult {
  const historyRefs = useHistoryRefs()
  const cmdSearch = useCommandSearchState()
  const suggestionSearchIndex = useSuggestionSearchIndex()
  const suggestionControls = useHistorySuggestionSearch({ ...params, ...suggestionSearchIndex })

  return { historyRefs, suggestionControls, cmdSearch }
}

function dedupeCommands(commands: string[]): string[] {
  const seen = new Set<string>()
  const deduped: string[] = []

  for (const command of commands) {
    if (command && !seen.has(command)) {
      seen.add(command)
      deduped.push(command)
    }
  }

  return deduped
}

function clearPendingDebounce(
  histSuggestDebounceRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>,
): void {
  if (histSuggestDebounceRef.current !== null) {
    clearTimeout(histSuggestDebounceRef.current)
    histSuggestDebounceRef.current = null
  }
}

function dismissHistorySuggestions(params: SuggestionSearchParams): void {
  if (!params.isHistorySuggestionRef.current) return

  params.setCompletionVisible(false)
  params.completionVisibleRef.current = false
  params.setCompletions([])
  params.completionsRef.current = []
  params.isHistorySuggestionRef.current = false
}

function performFuseSearch(trimmed: string, params: SuggestionSearchParams): void {
  const fuse = params.fuseRef.current
  if (!fuse) return

  const suggestions = fuse.search(trimmed, { limit: 8 })
    .filter((result) => result.item !== trimmed)
    .map((result) => ({ value: result.item, type: 'cmd' as const }))

  if (suggestions.length === 0) {
    dismissHistorySuggestions(params)
    return
  }

  params.setCompletions(suggestions)
  params.completionsRef.current = suggestions
  params.setCompletionIndex(0)
  params.completionIndexRef.current = 0
  params.setCompletionVisible(true)
  params.completionVisibleRef.current = true
  params.isHistorySuggestionRef.current = true
  params.setCompletionPos(HISTORY_SUGGESTION_POS)
}
