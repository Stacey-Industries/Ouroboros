import type { SelectionTooltipState } from './SelectionTooltip'
import type { TerminalContextMenuState } from './TerminalContextMenu'
import type {
  TerminalFoundation,
  TerminalHistoryState,
  TerminalInstanceController,
} from './TerminalInstanceController.types'
import type { CommandBlock as RichCommandBlock } from './useCommandBlocks'

type TerminalCoreController = Pick<
  TerminalInstanceController,
  | 'sessionId'
  | 'isActive'
  | 'isRecording'
  | 'onToggleRecording'
  | 'onSplit'
  | 'syncInput'
  | 'onToggleSync'
  | 'commandBlocksEnabled'
  | 'containerRef'
  | 'terminalRef'
  | 'searchAddonRef'
  | 'progressAddonRef'
  | 'serializeAddonRef'
  | 'showSearch'
  | 'closeSearch'
  | 'commandBlocks'
>

type TerminalInteractionController = Omit<
  TerminalInstanceController,
  keyof TerminalCoreController | 'historyHook' | 'completions'
>

interface ContextMenuBridge {
  contextMenu: TerminalContextMenuState
  handleContextMenu: TerminalInstanceController['handleContextMenu']
  closeContextMenu: () => void
}

interface PasteBridge {
  pendingPaste: string | null
  handlePasteConfirm: () => void
  handlePasteSingleLine: () => void
  handlePasteCancel: () => void
}

interface RichInputBridge {
  richInputActive: boolean
  openRichInput: () => void
  handleRichInputSubmit: (text: string) => void
  handleRichInputCancel: () => void
}

interface TooltipBridge {
  selectionTooltip: SelectionTooltipState
  handleTooltipOpenUrl: (url: string) => void
  handleTooltipOpenFile: (filePath: string) => void
  handleTooltipDismiss: () => void
}

interface CommandSearchBridge {
  handleCmdSearchSelect: (command: string) => void
  handleCmdSearchClose: () => void
}

export interface ControllerBuildArgs {
  foundation: TerminalFoundation
  contextMenuState: ContextMenuBridge
  pasteState: PasteBridge
  richInputState: RichInputBridge
  tooltipState: TooltipBridge
  cmdSearchActions: CommandSearchBridge
  handleCopyBlockOutput: (block: RichCommandBlock) => void
  historyState: TerminalHistoryState
}

function buildTerminalCoreController(
  foundation: TerminalFoundation,
): TerminalCoreController {
  return {
    sessionId: foundation.sessionId,
    isActive: foundation.isActive,
    isRecording: foundation.isRecording,
    onToggleRecording: foundation.onToggleRecording,
    onSplit: foundation.onSplit,
    syncInput: foundation.syncInput,
    onToggleSync: foundation.onToggleSync,
    commandBlocksEnabled: foundation.commandBlocksEnabled,
    containerRef: foundation.containerRef,
    terminalRef: foundation.terminalRef,
    searchAddonRef: foundation.searchAddonRef,
    progressAddonRef: foundation.progressAddonRef,
    serializeAddonRef: foundation.serializeAddonRef,
    showSearch: foundation.showSearch,
    closeSearch: foundation.closeSearch,
    commandBlocks: foundation.commandBlocks,
  }
}

function buildTerminalInteractionController(
  args: ControllerBuildArgs,
): TerminalInteractionController {
  return {
    contextMenu: args.contextMenuState.contextMenu,
    handleContextMenu: args.contextMenuState.handleContextMenu,
    closeContextMenu: args.contextMenuState.closeContextMenu,
    pendingPaste: args.pasteState.pendingPaste,
    handlePasteConfirm: args.pasteState.handlePasteConfirm,
    handlePasteSingleLine: args.pasteState.handlePasteSingleLine,
    handlePasteCancel: args.pasteState.handlePasteCancel,
    richInputActive: args.richInputState.richInputActive,
    openRichInput: args.richInputState.openRichInput,
    handleRichInputSubmit: args.richInputState.handleRichInputSubmit,
    handleRichInputCancel: args.richInputState.handleRichInputCancel,
    selectionTooltip: args.tooltipState.selectionTooltip,
    handleTooltipOpenUrl: args.tooltipState.handleTooltipOpenUrl,
    handleTooltipOpenFile: args.tooltipState.handleTooltipOpenFile,
    handleTooltipDismiss: args.tooltipState.handleTooltipDismiss,
    handleCmdSearchSelect: args.cmdSearchActions.handleCmdSearchSelect,
    handleCmdSearchClose: args.cmdSearchActions.handleCmdSearchClose,
    handleCopyBlockOutput: args.handleCopyBlockOutput,
  }
}

export function buildTerminalController(
  args: ControllerBuildArgs,
): TerminalInstanceController {
  return {
    ...buildTerminalCoreController(args.foundation),
    ...buildTerminalInteractionController(args),
    historyHook: args.historyState.historyHook,
    completions: args.historyState.completions,
  }
}
