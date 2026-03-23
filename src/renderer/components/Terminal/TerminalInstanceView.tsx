import React, { useCallback, useMemo,useState } from 'react'

import { BlockNavigator } from './BlockNavigator'
import { CommandBlockOverlay } from './CommandBlockOverlay'
import { CommandSearchOverlay } from './CommandHistorySearch'
import { CompletionOverlay } from './CompletionOverlay'
import { CopyButton } from './CopyButton'
import { PasteConfirmBanner } from './PasteConfirmation'
import { RichInput } from './RichInput'
import { TerminalSearchBar } from './SearchBar'
import { SelectionTooltip } from './SelectionTooltip'
import { StickyScrollOverlay } from './StickyScrollOverlay'
import { TerminalContextMenu } from './TerminalContextMenu'
import type { TerminalInstanceController } from './TerminalInstanceController'
import { TerminalProgressBar } from './TerminalProgressBar'
import {
  MultiLineButton,
  RecordingButton,
  SplitButton,
  SyncButton,
} from './TerminalToolbar'

const ROOT_STYLE: React.CSSProperties = {
  position: 'relative',
  width: '100%',
  height: '100%',
  overflow: 'hidden',
  flexDirection: 'column',
  backgroundColor: 'var(--term-bg, var(--bg))',
}

const CONTAINER_STYLE: React.CSSProperties = {
  width: '100%',
  flex: '1 1 0',
  minHeight: 0,
  overflow: 'hidden',
}

const TOOLBAR_STYLE: React.CSSProperties = {
  position: 'absolute',
  bottom: 6,
  right: 6,
  zIndex: 10,
  display: 'flex',
  alignItems: 'center',
  gap: 4,
}

function getRootStyle(isActive: boolean): React.CSSProperties {
  return { ...ROOT_STYLE, display: isActive ? 'flex' : 'none' }
}

function applyCompletionSelection(
  controller: TerminalInstanceController,
  value: string,
): void {
  const type = controller.completions.state.completions.find(
    (completion) => completion.value === value,
  )?.type ?? 'file'
  controller.completions.actions.applyCompletion(value, type)
}

function navigateCompletion(
  controller: TerminalInstanceController,
  delta: number,
): void {
  const maxIndex = controller.completions.state.completions.length - 1
  const nextIndex = Math.max(
    0,
    Math.min(controller.completions.state.completionIndex + delta, maxIndex),
  )
  controller.completions.state.setCompletionIndex(nextIndex)
  controller.completions.state.completionIndexRef.current = nextIndex
}

function dismissCompletion(controller: TerminalInstanceController): void {
  controller.completions.state.setCompletionVisible(false)
  controller.completions.state.completionVisibleRef.current = false
  controller.historyHook.suggestionControls.isHistorySuggestionRef.current = false
  controller.completions.state.setCompletions([])
}

function TerminalToolbarLayer({
  controller,
  isHovered,
}: {
  controller: TerminalInstanceController
  isHovered: boolean
}): React.ReactElement {
  const searchAddon = controller.searchAddonRef.current

  return (
    <>
      {controller.showSearch && searchAddon && (
        <TerminalSearchBar searchAddon={searchAddon} onClose={controller.closeSearch} />
      )}

      <TerminalToolbarButtons controller={controller} isHovered={isHovered} />
    </>
  )
}

function TerminalToolbarButtons({
  controller,
  isHovered,
}: {
  controller: TerminalInstanceController
  isHovered: boolean
}): React.ReactElement {
  const terminal = controller.terminalRef.current
  const showSearch = controller.showSearch

  return (
    <div style={TOOLBAR_STYLE}>
      {controller.onToggleSync && <SyncButton syncInput={controller.syncInput} isHovered={isHovered} showSearch={showSearch} onToggleSync={controller.onToggleSync} />}
      {controller.onSplit && <SplitButton sessionId={controller.sessionId} isHovered={isHovered} showSearch={showSearch} onSplit={controller.onSplit} />}
      {controller.onToggleRecording && <RecordingButton sessionId={controller.sessionId} isRecording={controller.isRecording} isHovered={isHovered} showSearch={showSearch} onToggleRecording={controller.onToggleRecording} />}
      {!showSearch && <CopyButton terminal={terminal} visible={isHovered} />}
      <MultiLineButton isActive={controller.richInputActive} isHovered={isHovered} showSearch={showSearch} onClick={controller.richInputActive ? controller.handleRichInputCancel : controller.openRichInput} />
    </div>
  )
}

function TerminalProgressBarLayer({
  controller,
}: {
  controller: TerminalInstanceController
}): React.ReactElement | null {
  const subscribe = useMemo(() => {
    const addon = controller.progressAddonRef.current
    if (!addon) return null
    return (cb: (state: import('@xterm/addon-progress').IProgressState) => void) => addon.onChange(cb)
  }, [controller.progressAddonRef])

  return <TerminalProgressBar subscribe={subscribe} />
}

function TerminalCommandBlocks({
  controller,
}: {
  controller: TerminalInstanceController
}): React.ReactElement | null {
  const handleCopyCommand = useCallback((block: import('./useCommandBlocks').CommandBlock) => {
    if (block.command) {
      void navigator.clipboard.writeText(block.command)
    }
  }, [])

  if (!controller.commandBlocksEnabled) {
    return null
  }

  const { activeBlockIndex, blocks, navigateNext, navigatePrev } = controller.commandBlocks
  const terminal = controller.terminalRef.current

  return (
    <>
      <CommandBlockOverlay
        blocks={blocks}
        terminal={terminal}
        onToggleCollapse={controller.commandBlocks.toggleCollapse}
        onCopyOutput={controller.handleCopyBlockOutput}
        onCopyCommand={handleCopyCommand}
        activeBlockIndex={activeBlockIndex}
        sessionId={controller.sessionId}
      />

      <StickyScrollOverlay
        blocks={blocks}
        terminal={terminal}
      />

      <BlockNavigator
        totalBlocks={blocks.length}
        activeIndex={activeBlockIndex}
        onNavigateUp={() => terminal && navigatePrev(terminal)}
        onNavigateDown={() => terminal && navigateNext(terminal)}
        visible={blocks.length >= 2}
      />
    </>
  )
}

function TerminalCompletionLayer({
  controller,
}: {
  controller: TerminalInstanceController
}): React.ReactElement | null {
  if (!controller.completions.state.completionVisible) {
    return null
  }

  return (
    <CompletionOverlay
      completions={controller.completions.state.completions}
      selectedIndex={controller.completions.state.completionIndex}
      visible={controller.completions.state.completionVisible}
      position={controller.completions.state.completionPos}
      onSelect={(value) => applyCompletionSelection(controller, value)}
      onNavigate={(delta) => navigateCompletion(controller, delta)}
      onDismiss={() => dismissCompletion(controller)}
    />
  )
}

function TerminalActionLayers({
  controller,
}: {
  controller: TerminalInstanceController
}): React.ReactElement {
  return (
    <>
      <TerminalOverlayModals controller={controller} />
      <TerminalRichInputLayer controller={controller} />
    </>
  )
}

function TerminalOverlayModals({
  controller,
}: {
  controller: TerminalInstanceController
}): React.ReactElement {
  return (
    <>
      {controller.pendingPaste && (
        <PasteConfirmBanner
          text={controller.pendingPaste}
          onConfirm={controller.handlePasteConfirm}
          onConfirmSingleLine={controller.handlePasteSingleLine}
          onCancel={controller.handlePasteCancel}
        />
      )}
      <TerminalContextMenu
        state={controller.contextMenu}
        terminal={controller.terminalRef.current}
        sessionId={controller.sessionId}
        onClose={controller.closeContextMenu}
      />
      <SelectionTooltip
        state={controller.selectionTooltip}
        onOpenUrl={controller.handleTooltipOpenUrl}
        onOpenFile={controller.handleTooltipOpenFile}
        onDismiss={controller.handleTooltipDismiss}
      />
      {controller.historyHook.cmdSearch.showCmdSearch && (
        <CommandSearchOverlay
          commands={controller.historyHook.cmdSearch.cmdHistory}
          onSelect={controller.handleCmdSearchSelect}
          onClose={controller.handleCmdSearchClose}
        />
      )}
    </>
  )
}

function TerminalRichInputLayer({
  controller,
}: {
  controller: TerminalInstanceController
}): React.ReactElement {
  return (
    <RichInput
      sessionId={controller.sessionId}
      onSubmit={controller.handleRichInputSubmit}
      onCancel={controller.handleRichInputCancel}
      visible={controller.richInputActive}
    />
  )
}

export function TerminalInstanceView({
  controller,
}: {
  controller: TerminalInstanceController
}): React.ReactElement {
  const [isHovered, setIsHovered] = useState(false)

  return (
    <div
      style={getRootStyle(controller.isActive)}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onContextMenu={controller.handleContextMenu}
    >
      <TerminalToolbarLayer controller={controller} isHovered={isHovered} />

      <div
        ref={controller.containerRef}
        style={CONTAINER_STYLE}
        aria-label="Terminal"
        data-session-id={controller.sessionId}
      />

      <TerminalProgressBarLayer controller={controller} />
      <TerminalCommandBlocks controller={controller} />
      <TerminalCompletionLayer controller={controller} />
      <TerminalActionLayers controller={controller} />
    </div>
  )
}
