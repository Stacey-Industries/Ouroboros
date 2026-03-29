import type { FitAddon } from '@xterm/addon-fit'
import type { ProgressAddon } from '@xterm/addon-progress'
import type { SearchAddon } from '@xterm/addon-search'
import type { SerializeAddon } from '@xterm/addon-serialize'
import type { WebglAddon } from '@xterm/addon-webgl'
import type { Terminal } from '@xterm/xterm'
import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'

import { useProject } from '../../contexts/ProjectContext'
import type { SelectionTooltipState } from './SelectionTooltip'
import type { ShellIntegrationAddon } from './shellIntegrationAddon'
import type {
  TerminalFoundation,
  TerminalHistoryState,
  TerminalInstanceProps,
} from './TerminalInstanceController.types'
import {
  useLatestRef,
  useThemeSync,
} from './TerminalInstanceUiState'
import type { CommandBlock as RichCommandBlock } from './useCommandBlocks'
import { useCommandBlocks } from './useCommandBlocks'
import { useTerminalCompletions } from './useTerminalCompletions'
import { useTerminalHistory } from './useTerminalHistory'
import { useTerminalSetup } from './useTerminalSetup'

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
  initialFontSize?: number
  initialCursorStyle?: 'block' | 'underline' | 'bar'
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

function useTerminalCoreRefs() {
  const containerRef = useRef<HTMLDivElement>(null)
  const terminalRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const searchAddonRef = useRef<SearchAddon | null>(null)
  const shellIntegrationAddonRef = useRef<ShellIntegrationAddon | null>(null)
  const progressAddonRef = useRef<ProgressAddon | null>(null)
  const serializeAddonRef = useRef<SerializeAddon | null>(null)
  const isReadyRef = useRef(false)
  const webglAddonRef = useRef<WebglAddon | null>(null)
  return { containerRef, terminalRef, fitAddonRef, searchAddonRef, shellIntegrationAddonRef, progressAddonRef, serializeAddonRef, isReadyRef, webglAddonRef }
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
    shellIntegrationAddonRef: coreRefs.shellIntegrationAddonRef,
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
  foundation: TerminalFoundation & {
    shellIntegrationAddonRef?: { current: ShellIntegrationAddon | null }
    progressAddonRef?: { current: ProgressAddon | null }
    serializeAddonRef?: { current: SerializeAddon | null }
  },
): Parameters<typeof useTerminalSetup>[0]['refs'] {
  return {
    containerRef: foundation.containerRef,
    terminalRef: foundation.terminalRef,
    fitAddonRef: foundation.fitAddonRef,
    searchAddonRef: foundation.searchAddonRef,
    shellIntegrationAddonRef: foundation.shellIntegrationAddonRef ?? { current: null },
    progressAddonRef: foundation.progressAddonRef ?? { current: null },
    serializeAddonRef: foundation.serializeAddonRef ?? { current: null },
    isReadyRef: foundation.isReadyRef as MutableRefObject<boolean>,
    webglAddonRef: foundation.webglAddonRef,
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
    initialFontSize: args.initialFontSize,
    initialCursorStyle: args.initialCursorStyle,
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
