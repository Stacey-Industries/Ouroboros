/**
 * useTerminalCompletions â€” Tab completion (files, git branches, git subcommands)
 * and completion overlay state management.
 */

import { useCallback, useEffect, useRef, useState } from 'react'

import type { Completion } from './CompletionOverlay'
import {
  appendCompletionValue,
  dismissCompletionPopup,
  generateCompletions,
  getCurrentWord,
  showCompletionPopup,
  syncCwd,
} from './useTerminalCompletions.shared'

interface CompletionStore {
  completions: Completion[]
  completionIndex: number
  completionPos: { x: number; y: number }
  completionVisible: boolean
  setCompletions: React.Dispatch<React.SetStateAction<Completion[]>>
  setCompletionIndex: React.Dispatch<React.SetStateAction<number>>
  setCompletionPos: React.Dispatch<React.SetStateAction<{ x: number; y: number }>>
  setCompletionVisible: React.Dispatch<React.SetStateAction<boolean>>
}

interface CompletionRefs {
  completionIndexRef: React.MutableRefObject<number>
  completionVisibleRef: React.MutableRefObject<boolean>
  completionsRef: React.MutableRefObject<Completion[]>
  cwdRef: React.MutableRefObject<string>
}

interface ApplyCompletionParams extends CompletionStore, CompletionRefs {
  currentLineRef: React.MutableRefObject<string>
  isHistorySuggestionRef: React.MutableRefObject<boolean>
  sessionId: string
}

interface TabCompletionParams extends CompletionStore, CompletionRefs {
  currentLineRef: React.MutableRefObject<string>
  isHistorySuggestionRef: React.MutableRefObject<boolean>
  sessionId: string
}

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

function useCompletionStore(cwd?: string): CompletionStore & CompletionRefs {
  const [completions, setCompletions] = useState<Completion[]>([])
  const [completionVisible, setCompletionVisible] = useState(false)
  const [completionIndex, setCompletionIndex] = useState(0)
  const [completionPos, setCompletionPos] = useState({ x: 0, y: 0 })

  const completionVisibleRef = useRef(false)
  const completionIndexRef = useRef(0)
  const completionsRef = useRef<Completion[]>([])
  const cwdRef = useRef(cwd ?? '')

  useEffect(() => { cwdRef.current = cwd ?? '' }, [cwd])
  useEffect(() => { completionVisibleRef.current = completionVisible }, [completionVisible])
  useEffect(() => { completionIndexRef.current = completionIndex }, [completionIndex])
  useEffect(() => { completionsRef.current = completions }, [completions])

  return {
    completions,
    completionIndex,
    completionIndexRef,
    completionPos,
    completionVisible,
    completionVisibleRef,
    completionsRef,
    cwdRef,
    setCompletions,
    setCompletionIndex,
    setCompletionPos,
    setCompletionVisible,
  }
}

function buildCompletionState(store: CompletionStore & CompletionRefs): CompletionState {
  return {
    completions: store.completions,
    setCompletions: store.setCompletions,
    completionVisible: store.completionVisible,
    setCompletionVisible: store.setCompletionVisible,
    completionIndex: store.completionIndex,
    setCompletionIndex: store.setCompletionIndex,
    completionPos: store.completionPos,
    setCompletionPos: store.setCompletionPos,
    completionVisibleRef: store.completionVisibleRef,
    completionIndexRef: store.completionIndexRef,
    completionsRef: store.completionsRef,
  }
}

function useApplyCompletion(params: ApplyCompletionParams): (value: string, type: string) => void {
  const {
    currentLineRef,
    isHistorySuggestionRef,
    sessionId,
    setCompletions,
    setCompletionVisible,
    completionVisibleRef,
    completionsRef,
  } = params

  return useCallback((value: string, type: string) => {
    if (type === 'cmd') {
      void window.electronAPI.pty.write(sessionId, '\x15' + value)
      currentLineRef.current = value
    } else {
      appendCompletionValue(sessionId, currentLineRef, value, type)
    }

    dismissCompletionPopup({ completionVisibleRef, completionsRef, isHistorySuggestionRef, setCompletions, setCompletionVisible })
  }, [completionVisibleRef, completionsRef, currentLineRef, isHistorySuggestionRef, sessionId, setCompletions, setCompletionVisible])
}

function useTabCompletion(params: TabCompletionParams): Pick<CompletionActions, 'handleTabCompletion' | 'handleTabCompletionRef'> {
  const {
    currentLineRef,
    isHistorySuggestionRef,
    sessionId,
    completionIndexRef,
    completionVisibleRef,
    completionsRef,
    cwdRef,
    setCompletions,
    setCompletionIndex,
    setCompletionPos,
    setCompletionVisible,
  } = params
  const handleTabCompletionRef = useRef<(() => Promise<void>) | null>(null)
  const handleTabCompletion = useCallback(async () => {
    isHistorySuggestionRef.current = false
    await syncCwd(sessionId, cwdRef)
    const line = currentLineRef.current
    const word = getCurrentWord(line)
    const suggestions = await generateCompletions(line, word, cwdRef.current)
    if (suggestions.length === 0) return
    if (suggestions.length === 1) {
      appendCompletionValue(sessionId, currentLineRef, suggestions[0].value, suggestions[0].type)
      return
    }
    showCompletionPopup({
      suggestions,
      completionIndexRef,
      completionVisibleRef,
      completionsRef,
      setCompletions,
      setCompletionIndex,
      setCompletionPos,
      setCompletionVisible,
    })
  }, [completionIndexRef, completionVisibleRef, completionsRef, currentLineRef, cwdRef, isHistorySuggestionRef, sessionId, setCompletions, setCompletionIndex, setCompletionPos, setCompletionVisible])
  useEffect(() => { handleTabCompletionRef.current = handleTabCompletion }, [handleTabCompletion])
  return { handleTabCompletion, handleTabCompletionRef }
}

export function useTerminalCompletions(
  params: UseTerminalCompletionsParams,
): UseTerminalCompletionsResult {
  const { sessionId, currentLineRef, isHistorySuggestionRef, cwd } = params
  const store = useCompletionStore(cwd)
  const applyCompletion = useApplyCompletion({ sessionId, currentLineRef, isHistorySuggestionRef, ...store })
  const { handleTabCompletion, handleTabCompletionRef } = useTabCompletion({ sessionId, currentLineRef, isHistorySuggestionRef, ...store })

  return {
    state: buildCompletionState(store),
    actions: { applyCompletion, handleTabCompletion, handleTabCompletionRef },
  }
}
