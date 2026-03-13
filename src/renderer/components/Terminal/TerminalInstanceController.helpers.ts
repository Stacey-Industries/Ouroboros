import { useCallback, useEffect, useRef, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type { FitAddon } from '@xterm/addon-fit'
import type { SearchAddon } from '@xterm/addon-search'
import type { Terminal } from '@xterm/xterm'
import { useProject } from '../../contexts/ProjectContext'
import type { SelectionTooltipState } from './SelectionTooltip'
import {
  useLatestRef,
  useThemeSync,
} from './TerminalInstanceUiState'
import { useCommandBlocks } from './useCommandBlocks'
import type { CommandBlock as RichCommandBlock } from './useCommandBlocks'
import { useTerminalCompletions } from './useTerminalCompletions'
import { useTerminalHistory } from './useTerminalHistory'
import { useTerminalSetup } from './useTerminalSetup'
import type {
  TerminalFoundation,
  TerminalHistoryState,
  TerminalInstanceProps,
} from './TerminalInstanceController.types'

type NormalizedTerminalProps = Pick<
  TerminalFoundation,
  | 'sessionId'
  | 'isActive'
  | 'isRecording'
  | 'onToggleRecording'
  | 'onSplit'
  | 'syncInput'
  | 'onToggleSync'
  | 'commandBlocksEnabled'
>

type TerminalRefsState = Omit<
  TerminalFoundation,
  keyof NormalizedTerminalProps | 'onTitleChange' | 'cwd'
>

interface TerminalRefsArgs {
  projectRoot: string | null
  syncInput: boolean
  allSessionIds: string[]
  commandBlocksEnabled: boolean
  promptPattern?: string
}

interface SetupBridgeArgs {
  foundation: TerminalFoundation
  historyState: TerminalHistoryState
  setPendingPaste: Dispatch<SetStateAction<string | null>>
  setRichInputActive: Dispatch<SetStateAction<boolean>>
  setSelectionTooltip: Dispatch<SetStateAction<SelectionTooltipState>>
}

function normalizeTerminalProps(props: TerminalInstanceProps): NormalizedTerminalProps {
  const {
    sessionId,
    isActive,
    isRecording = false,
    onToggleRecording,
    onSplit,
    syncInput = false,
    onToggleSync,
    commandBlocksEnabled = true,
  } = props

  return {
    sessionId,
    isActive,
    isRecording,
    onToggleRecording,
    onSplit,
    syncInput,
    onToggleSync,
    commandBlocksEnabled,
  }
}

function useTerminalCoreRefs(): Pick<
  TerminalRefsState,
  'containerRef' | 'terminalRef' | 'fitAddonRef' | 'searchAddonRef' | 'isReadyRef'
> {
  const containerRef = useRef<HTMLDivElement>(null)
  const terminalRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const searchAddonRef = useRef<SearchAddon | null>(null)
  const isReadyRef = useRef(false)
  return { containerRef, terminalRef, fitAddonRef, searchAddonRef, isReadyRef }
}

function useTerminalSearchState(): Pick<
  TerminalRefsState,
  'showSearch' | 'setShowSearch' | 'closeSearch'
> {
  const [showSearch, setShowSearch] = useState(false)
  const closeSearch = useCallback(() => setShowSearch(false), [])
  return { showSearch, setShowSearch, closeSearch }
}

function useTerminalLatestRefs(
  args: TerminalRefsArgs,
  commandBlocks: TerminalFoundation['commandBlocks'],
): Pick<
  TerminalRefsState,
  'projectRootRef' | 'syncInputRef' | 'allSessionIdsRef' | 'commandBlocksRef'
> {
  return {
    projectRootRef: useLatestRef(args.projectRoot),
    syncInputRef: useLatestRef(args.syncInput),
    allSessionIdsRef: useLatestRef(args.allSessionIds),
    commandBlocksRef: useLatestRef(commandBlocks),
  }
}

function useTerminalRefs(args: TerminalRefsArgs): TerminalRefsState {
  const coreRefs = useTerminalCoreRefs()
  const searchState = useTerminalSearchState()
  const commandBlocks = useCommandBlocks({
    enabled: args.commandBlocksEnabled,
    promptPattern: args.promptPattern,
  })
  const latestRefs = useTerminalLatestRefs(args, commandBlocks)

  return { ...coreRefs, ...searchState, ...latestRefs, commandBlocks }
}

export function useTerminalFoundation(props: TerminalInstanceProps): TerminalFoundation {
  const coreProps = normalizeTerminalProps(props)
  const { projectRoot } = useProject()
  const refs = useTerminalRefs({
    projectRoot,
    syncInput: coreProps.syncInput,
    allSessionIds: props.allSessionIds ?? [],
    commandBlocksEnabled: coreProps.commandBlocksEnabled,
    promptPattern: props.promptPattern,
  })

  return { ...coreProps, onTitleChange: props.onTitleChange, cwd: props.cwd, ...refs }
}

function createMutableRef<T>(current: T): { current: T } {
  return { current }
}

export function useTerminalHistoryState(
  sessionId: string,
  cwd?: string,
): TerminalHistoryState {
  const completionSeed = {
    currentLineRef: createMutableRef(''),
    isHistorySuggestionRef: createMutableRef(false),
  }
  const completionHook = useTerminalCompletions({ sessionId, cwd, ...completionSeed })
  const historyHook = useTerminalHistory({
    setCompletions: completionHook.state.setCompletions,
    setCompletionIndex: completionHook.state.setCompletionIndex,
    setCompletionVisible: completionHook.state.setCompletionVisible,
    setCompletionPos: completionHook.state.setCompletionPos,
    completionVisibleRef: completionHook.state.completionVisibleRef,
    completionIndexRef: completionHook.state.completionIndexRef,
    completionsRef: completionHook.state.completionsRef,
  })
  const completions = useTerminalCompletions({
    sessionId,
    currentLineRef: historyHook.historyRefs.currentLineRef,
    isHistorySuggestionRef: historyHook.suggestionControls.isHistorySuggestionRef,
    cwd,
  })

  return { historyHook, completions }
}

function createSetupRefs(
  foundation: TerminalFoundation,
): Parameters<typeof useTerminalSetup>[0]['refs'] {
  return {
    containerRef: foundation.containerRef,
    terminalRef: foundation.terminalRef,
    fitAddonRef: foundation.fitAddonRef,
    searchAddonRef: foundation.searchAddonRef,
    isReadyRef: foundation.isReadyRef,
  }
}

function createSetupCallbacks(
  args: SetupBridgeArgs,
): Parameters<typeof useTerminalSetup>[0]['callbacks'] {
  return {
    onTitleChange: args.foundation.onTitleChange,
    setPendingPaste: args.setPendingPaste,
    setShowSearch: args.foundation.setShowSearch,
    setRichInputActive: args.setRichInputActive,
    setShowCmdSearch: args.historyState.historyHook.cmdSearch.setShowCmdSearch,
    setCmdHistory: args.historyState.historyHook.cmdSearch.setCmdHistory,
    setSelectionTooltip: args.setSelectionTooltip,
  }
}

function createSetupOptions(args: SetupBridgeArgs): Parameters<typeof useTerminalSetup>[0] {
  return {
    sessionId: args.foundation.sessionId,
    refs: createSetupRefs(args.foundation),
    callbacks: createSetupCallbacks(args),
    completionState: args.historyState.completions.state,
    historyRefs: args.historyState.historyHook.historyRefs,
    suggestionControls: args.historyState.historyHook.suggestionControls,
    handleTabCompletionRef: args.historyState.completions.actions.handleTabCompletionRef,
    syncInputRef: args.foundation.syncInputRef,
    allSessionIdsRef: args.foundation.allSessionIdsRef,
    projectRootRef: args.foundation.projectRootRef,
    commandBlocksRef: args.foundation.commandBlocksRef,
  }
}

function useFitOnActive(isActive: boolean, fit: () => void): void {
  useEffect(() => {
    if (isActive) {
      requestAnimationFrame(() => requestAnimationFrame(fit))
    }
  }, [fit, isActive])
}

export function useTerminalSetupBridge(args: SetupBridgeArgs): void {
  const { fit, syncTheme } = useTerminalSetup(createSetupOptions(args))
  useFitOnActive(args.foundation.isActive, fit)
  useThemeSync(syncTheme)
}

export function useCopyBlockOutput(
  foundation: TerminalFoundation,
): (block: RichCommandBlock) => void {
  return useCallback((block: RichCommandBlock) => {
    const terminal = foundation.terminalRef.current
    if (!terminal) {
      return
    }

    void navigator.clipboard.writeText(
      foundation.commandBlocks.getBlockOutput(block, terminal),
    )
  }, [foundation.commandBlocks, foundation.terminalRef])
}
