import type { FitAddon } from '@xterm/addon-fit'
import type { ProgressAddon } from '@xterm/addon-progress'
import type { SearchAddon } from '@xterm/addon-search'
import type { SerializeAddon } from '@xterm/addon-serialize'
import type { WebglAddon } from '@xterm/addon-webgl'
import type { Terminal } from '@xterm/xterm'
import type {
  Dispatch,
  MutableRefObject,
  RefObject,
  SetStateAction,
} from 'react'

import type { SelectionTooltipState } from './SelectionTooltip'
import type { ShellIntegrationAddon } from './shellIntegrationAddon'
import type { CommandBlock } from './terminalHelpers'
import type { CompletionState } from './useTerminalCompletions'
import type { HistoryRefs, HistorySuggestionControls } from './useTerminalHistory'

export interface TerminalRefs {
  containerRef: RefObject<HTMLDivElement | null>
  terminalRef: MutableRefObject<Terminal | null>
  fitAddonRef: MutableRefObject<FitAddon | null>
  searchAddonRef: MutableRefObject<SearchAddon | null>
  shellIntegrationAddonRef: MutableRefObject<ShellIntegrationAddon | null>
  progressAddonRef: MutableRefObject<ProgressAddon | null>
  serializeAddonRef: MutableRefObject<SerializeAddon | null>
  isReadyRef: MutableRefObject<boolean>
  webglAddonRef: MutableRefObject<WebglAddon | null>
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
  projectRootRef: MutableRefObject<string | null>
  commandBlocksRef: MutableRefObject<{
    handleOsc133: (seq: string, param: string | undefined, term: Terminal) => void
    handleData: (data: string, term: Terminal) => void
    navigatePrev: (term: Terminal) => void
    navigateNext: (term: Terminal) => void
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
  initialFontSize?: number
  initialCursorStyle?: 'block' | 'underline' | 'bar'
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
