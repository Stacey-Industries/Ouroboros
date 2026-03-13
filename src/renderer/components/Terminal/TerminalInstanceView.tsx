import React, { useState } from 'react'
import type { Terminal } from '@xterm/xterm'
import { TerminalContextMenu } from './TerminalContextMenu'
import { CompletionOverlay } from './CompletionOverlay'
import { SelectionTooltip } from './SelectionTooltip'
import { CommandSearchOverlay } from './CommandHistorySearch'
import { TerminalSearchBar } from './SearchBar'
import { CopyButton } from './CopyButton'
import { PasteConfirmBanner } from './PasteConfirmation'
import { RichInput } from './RichInput'
import { CommandBlockOverlay } from './CommandBlockOverlay'
import { BlockNavigator } from './BlockNavigator'
import {
  SyncButton,
  SplitButton,
  RecordingButton,
  MultiLineButton,
} from './TerminalToolbar'
import type { TerminalInstanceController } from './TerminalInstanceController'

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

function navigateBlock(
  navigate: (terminal: Terminal) => void,
  terminal: Terminal | null,
): void {
  if (terminal) {
    navigate(terminal)
  }
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

      {!controller.showSearch && (
        <CopyButton terminal={controller.terminalRef.current} visible={isHovered} />
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
  return (
    <>
      {controller.onToggleSync && (
        <SyncButton
          syncInput={controller.syncInput}
          isHovered={isHovered}
          showSearch={controller.showSearch}
          onToggleSync={controller.onToggleSync}
        />
      )}
      {controller.onSplit && (
        <SplitButton
          sessionId={controller.sessionId}
          isHovered={isHovered}
          showSearch={controller.showSearch}
          onSplit={controller.onSplit}
        />
      )}
      {controller.onToggleRecording && (
        <RecordingButton
          sessionId={controller.sessionId}
          isRecording={controller.isRecording}
          isHovered={isHovered}
          showSearch={controller.showSearch}
          onToggleRecording={controller.onToggleRecording}
        />
      )}
    </>
  )
}

function TerminalCommandBlocks({
  controller,
}: {
  controller: TerminalInstanceController
}): React.ReactElement | null {
  if (!controller.commandBlocksEnabled) {
    return null
  }

  return (
    <>
      <CommandBlockOverlay
        blocks={controller.commandBlocks.blocks}
        terminal={controller.terminalRef.current}
        onToggleCollapse={controller.commandBlocks.toggleCollapse}
        onCopyOutput={controller.handleCopyBlockOutput}
        activeBlockIndex={controller.commandBlocks.activeBlockIndex}
      />

      <BlockNavigator
        totalBlocks={controller.commandBlocks.blocks.length}
        activeIndex={controller.commandBlocks.activeBlockIndex}
        onNavigateUp={() => navigateBlock(
          controller.commandBlocks.navigatePrev,
          controller.terminalRef.current,
        )}
        onNavigateDown={() => navigateBlock(
          controller.commandBlocks.navigateNext,
          controller.terminalRef.current,
        )}
        visible={controller.commandBlocks.blocks.length >= 2}
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
  isHovered,
}: {
  controller: TerminalInstanceController
  isHovered: boolean
}): React.ReactElement {
  return (
    <>
      <TerminalOverlayModals controller={controller} />
      <TerminalRichInputLayer controller={controller} isHovered={isHovered} />
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
  isHovered,
}: {
  controller: TerminalInstanceController
  isHovered: boolean
}): React.ReactElement {
  return (
    <>
      {!controller.richInputActive && (
        <MultiLineButton
          isHovered={isHovered}
          showSearch={controller.showSearch}
          onClick={controller.openRichInput}
        />
      )}
      <RichInput
        sessionId={controller.sessionId}
        onSubmit={controller.handleRichInputSubmit}
        onCancel={controller.handleRichInputCancel}
        visible={controller.richInputActive}
      />
    </>
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

      <TerminalCommandBlocks controller={controller} />
      <TerminalCompletionLayer controller={controller} />
      <TerminalActionLayers controller={controller} isHovered={isHovered} />
    </div>
  )
}
