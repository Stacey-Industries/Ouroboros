import type {
  Dispatch,
  MouseEvent,
  MutableRefObject,
  RefObject,
  SetStateAction,
} from 'react'
import type { FitAddon } from '@xterm/addon-fit'
import type { SearchAddon } from '@xterm/addon-search'
import type { ProgressAddon } from '@xterm/addon-progress'
import type { SerializeAddon } from '@xterm/addon-serialize'
import type { Terminal } from '@xterm/xterm'
import type { ShellIntegrationAddon } from './shellIntegrationAddon'
import type { SelectionTooltipState } from './SelectionTooltip'
import type { TerminalContextMenuState } from './TerminalContextMenu'
import type { CommandBlock as RichCommandBlock } from './useCommandBlocks'

type CommandBlocksHook = ReturnType<typeof import('./useCommandBlocks').useCommandBlocks>
type TerminalHistoryHook = ReturnType<typeof import('./useTerminalHistory').useTerminalHistory>
type TerminalCompletionsHook = ReturnType<typeof import('./useTerminalCompletions').useTerminalCompletions>

export interface TerminalInstanceProps {
  sessionId: string
  isActive: boolean
  onTitleChange?: (sessionId: string, title: string) => void
  isRecording?: boolean
  onToggleRecording?: (sessionId: string) => void
  onSplit?: (sessionId: string) => void
  syncInput?: boolean
  allSessionIds?: string[]
  onToggleSync?: () => void
  cwd?: string
  commandBlocksEnabled?: boolean
  promptPattern?: string
}

export interface TerminalInstanceController {
  sessionId: string
  isActive: boolean
  isRecording: boolean
  onToggleRecording?: (sessionId: string) => void
  onSplit?: (sessionId: string) => void
  syncInput: boolean
  onToggleSync?: () => void
  commandBlocksEnabled: boolean
  containerRef: RefObject<HTMLDivElement | null>
  terminalRef: RefObject<Terminal | null>
  searchAddonRef: RefObject<SearchAddon | null>
  progressAddonRef: RefObject<ProgressAddon | null>
  serializeAddonRef: RefObject<SerializeAddon | null>
  showSearch: boolean
  closeSearch: () => void
  contextMenu: TerminalContextMenuState
  handleContextMenu: (event: MouseEvent) => void
  closeContextMenu: () => void
  pendingPaste: string | null
  handlePasteConfirm: () => void
  handlePasteSingleLine: () => void
  handlePasteCancel: () => void
  richInputActive: boolean
  openRichInput: () => void
  handleRichInputSubmit: (text: string) => void
  handleRichInputCancel: () => void
  selectionTooltip: SelectionTooltipState
  handleTooltipOpenUrl: (url: string) => void
  handleTooltipOpenFile: (filePath: string) => void
  handleTooltipDismiss: () => void
  handleCmdSearchSelect: (command: string) => void
  handleCmdSearchClose: () => void
  handleCopyBlockOutput: (block: RichCommandBlock) => void
  commandBlocks: CommandBlocksHook
  historyHook: TerminalHistoryHook
  completions: TerminalCompletionsHook
}

export interface TerminalFoundation {
  sessionId: string
  isActive: boolean
  isRecording: boolean
  onToggleRecording?: (sessionId: string) => void
  onSplit?: (sessionId: string) => void
  syncInput: boolean
  onToggleSync?: () => void
  commandBlocksEnabled: boolean
  onTitleChange?: (sessionId: string, title: string) => void
  cwd?: string
  containerRef: RefObject<HTMLDivElement | null>
  terminalRef: RefObject<Terminal | null>
  fitAddonRef: RefObject<FitAddon | null>
  searchAddonRef: RefObject<SearchAddon | null>
  shellIntegrationAddonRef: MutableRefObject<ShellIntegrationAddon | null>
  progressAddonRef: RefObject<ProgressAddon | null>
  serializeAddonRef: RefObject<SerializeAddon | null>
  isReadyRef: RefObject<boolean>
  projectRootRef: MutableRefObject<string | null>
  syncInputRef: MutableRefObject<boolean>
  allSessionIdsRef: MutableRefObject<string[]>
  showSearch: boolean
  setShowSearch: Dispatch<SetStateAction<boolean>>
  closeSearch: () => void
  commandBlocks: CommandBlocksHook
  commandBlocksRef: MutableRefObject<CommandBlocksHook>
}

export interface TerminalHistoryState {
  historyHook: TerminalHistoryHook
  completions: TerminalCompletionsHook
}
