import type {
  Dispatch,
  MutableRefObject,
  RefObject,
  SetStateAction,
} from 'react'
import type { Terminal } from '@xterm/xterm'
import type { FitAddon } from '@xterm/addon-fit'
import type { SearchAddon } from '@xterm/addon-search'
import type { CommandBlock } from './terminalHelpers'
import type { SelectionTooltipState } from './SelectionTooltip'
import type { CompletionState } from './useTerminalCompletions'
import type { HistoryRefs, HistorySuggestionControls } from './useTerminalHistory'

export interface TerminalRefs {
  containerRef: RefObject<HTMLDivElement | null>
  terminalRef: MutableRefObject<Terminal | null>
  fitAddonRef: MutableRefObject<FitAddon | null>
  searchAddonRef: MutableRefObject<SearchAddon | null>
  isReadyRef: MutableRefObject<boolean>
}

export interface SetupCallbacks {
  onTitleChange?: (sessionId: string, title: string) => void
  setPendingPaste: Dispatch<SetStateAction<string | null>>
  setShowSearch: Dispatch<SetStateAction<boolean>>
  setRichInputActive: Dispatch<SetStateAction<boolean>>
  setShowCmdSearch: Dispatch<SetStateAction<boolean>>
  setCmdHistory: Dispatch<SetStateAction<string[]>>
  setSelectionTooltip: Dispatch<SetStateAction<SelectionTooltipState>>
}

export interface HandleTabCompletionRef {
  current: (() => Promise<void>) | null
}

export interface UseTerminalSetupParams {
  sessionId: string
  refs: TerminalRefs
  callbacks: SetupCallbacks
  completionState: CompletionState
  historyRefs: HistoryRefs
  suggestionControls: HistorySuggestionControls
  handleTabCompletionRef: HandleTabCompletionRef
  syncInputRef: MutableRefObject<boolean>
  allSessionIdsRef: MutableRefObject<string[]>
  projectRootRef: MutableRefObject<string>
  commandBlocksRef: MutableRefObject<{
    handleOsc133: (seq: string, param: string | undefined, term: Terminal) => void
    handleData: (data: string, term: Terminal) => void
  }>
}

export interface TerminalSetupRuntimeRefs {
  rafIdRef: MutableRefObject<number>
  resizeDebounceRef: MutableRefObject<ReturnType<typeof setTimeout> | null>
  clickCountRef: MutableRefObject<number>
  clickResetTimerRef: MutableRefObject<ReturnType<typeof setTimeout> | null>
  osc133EnabledRef: MutableRefObject<boolean | null>
  osc133GraceTimerRef: MutableRefObject<ReturnType<typeof setTimeout> | null>
  osc133FirstOutputRef: MutableRefObject<boolean>
  currentBlockRef: MutableRefObject<CommandBlock | null>
  blockDecorationDisposablesRef: MutableRefObject<Array<{ dispose(): void }>>
  writeBufferRef: MutableRefObject<string>
  writeRafRef: MutableRefObject<number>
  pendingOsc133Ref: MutableRefObject<Array<{
    sequence: string
    param: string | undefined
  }>>
}

export interface TerminalSetupLifecycleContext extends UseTerminalSetupParams {
  runtimeRefs: TerminalSetupRuntimeRefs
  fit: () => void
}

export interface AttachedTerminalDisposables {
  filePathLink: { dispose(): void }
  oscFg: { dispose(): void }
  oscBg: { dispose(): void }
  oscCursor: { dispose(): void }
  titleD: { dispose(): void }
  dataCleanup: () => void
  inputD: { dispose(): void }
  histKeyD: { dispose(): void }
  selD: { dispose(): void }
  ro: ResizeObserver
  clickHandler: (event: MouseEvent) => void
  mouseUpHandler: (event: MouseEvent) => void
}
