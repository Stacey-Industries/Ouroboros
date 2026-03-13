import {
  useCommandSearchActions,
  useContextMenuState,
  usePendingPaste,
  useRichInputState,
  useSelectionTooltipState,
} from './TerminalInstanceUiState'
import { buildTerminalController } from './TerminalInstanceController.build'
import {
  useCopyBlockOutput,
  useTerminalFoundation,
  useTerminalHistoryState,
  useTerminalSetupBridge,
} from './TerminalInstanceController.helpers'
import type {
  TerminalInstanceController,
  TerminalInstanceProps,
} from './TerminalInstanceController.types'

export type {
  TerminalInstanceController,
  TerminalInstanceProps,
} from './TerminalInstanceController.types'

export function useTerminalInstanceController(
  props: TerminalInstanceProps,
): TerminalInstanceController {
  const foundation = useTerminalFoundation(props)
  const historyState = useTerminalHistoryState(foundation.sessionId, foundation.cwd)
  const pasteState = usePendingPaste(foundation.sessionId)
  const contextMenuState = useContextMenuState(foundation.terminalRef)
  const richInputState = useRichInputState(foundation.sessionId, foundation.terminalRef)
  const tooltipState = useSelectionTooltipState()
  const cmdSearchActions = useCommandSearchActions(
    foundation.sessionId,
    historyState.historyHook.cmdSearch,
    foundation.terminalRef,
  )
  useTerminalSetupBridge({
    foundation,
    historyState,
    setPendingPaste: pasteState.setPendingPaste,
    setRichInputActive: richInputState.setRichInputActive,
    setSelectionTooltip: tooltipState.setSelectionTooltip,
  })

  return buildTerminalController({
    foundation,
    contextMenuState,
    pasteState,
    richInputState,
    tooltipState,
    cmdSearchActions,
    handleCopyBlockOutput: useCopyBlockOutput(foundation),
    historyState,
  })
}
