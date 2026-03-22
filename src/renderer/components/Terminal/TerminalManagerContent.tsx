import React from 'react'
import { TerminalInstance } from './TerminalInstance'
import { SplitPaneLayoutFrame, useSplitResize } from './TerminalManagerSplitPane'
import type { TerminalSession } from './TerminalTabs'

interface ActiveTerminalContentProps {
  session: TerminalSession
  isActive: boolean
  onTitleChange: (id: string, title: string) => void
  onRestart: (id: string) => void
  onClose: (id: string) => void
  onSplit?: (sessionId: string) => void
  onCloseSplit: (sessionId: string) => void
  recordingSessions?: Set<string>
  onToggleRecording?: (sessionId: string) => void
  syncInput: boolean
  allSessionIds: string[]
  onToggleSync: () => void
}

interface SharedTerminalProps {
  sessionId: string
  isActive: boolean
  onTitleChange: (id: string, title: string) => void
  recordingSessions?: Set<string>
  onToggleRecording?: (sessionId: string) => void
  onSplit?: (sessionId: string) => void
  syncInput: boolean
  allSessionIds: string[]
  onToggleSync: () => void
}

const EXITED_CONTAINER_CLASS = 'flex h-full w-full flex-col items-center justify-center gap-3 bg-[var(--term-bg,var(--bg))] font-mono text-sm text-text-semantic-muted'
const PRIMARY_EXITED_ACTION_CLASS = 'rounded bg-interactive-accent px-3 py-1 text-xs text-text-semantic-on-accent transition-colors duration-100 hover:bg-interactive-hover'
const SECONDARY_EXITED_ACTION_CLASS = 'rounded border border-border-semantic px-3 py-1 text-xs text-text-semantic-muted transition-colors duration-100 hover:bg-surface-raised hover:text-text-semantic-primary'

type TerminalStatus = TerminalSession['status']

function ExitedActionButton({
  className,
  onClick,
  children,
}: {
  className: string
  onClick: () => void
  children: React.ReactNode
}): React.ReactElement {
  return (
    <button onClick={onClick} className={className}>
      {children}
    </button>
  )
}

function TerminalExitedOverlay({
  sessionId,
  onRestart,
  onClose,
}: {
  sessionId: string
  onRestart: (id: string) => void
  onClose: (id: string) => void
}): React.ReactElement {
  return (
    <div className={EXITED_CONTAINER_CLASS}>
      <span className="opacity-60">Process exited</span>
      <div className="flex gap-2">
        <ExitedActionButton
          className={PRIMARY_EXITED_ACTION_CLASS}
          onClick={() => void onRestart(sessionId)}
        >
          Restart
        </ExitedActionButton>
        <ExitedActionButton
          className={SECONDARY_EXITED_ACTION_CLASS}
          onClick={() => onClose(sessionId)}
        >
          Close tab
        </ExitedActionButton>
      </div>
    </div>
  )
}

function SharedTerminalInstance({
  sessionId,
  isActive,
  onTitleChange,
  recordingSessions,
  onToggleRecording,
  onSplit,
  syncInput,
  allSessionIds,
  onToggleSync,
}: SharedTerminalProps): React.ReactElement {
  return (
    <TerminalInstance
      sessionId={sessionId}
      isActive={isActive}
      onTitleChange={onTitleChange}
      isRecording={recordingSessions?.has(sessionId) ?? false}
      onToggleRecording={onToggleRecording}
      onSplit={onSplit}
      syncInput={syncInput}
      allSessionIds={allSessionIds}
      onToggleSync={onToggleSync}
    />
  )
}

function getSharedTerminalProps({
  isActive,
  onTitleChange,
  recordingSessions,
  onToggleRecording,
  syncInput,
  allSessionIds,
  onToggleSync,
}: Pick<
  ActiveTerminalContentProps,
  | 'isActive'
  | 'onTitleChange'
  | 'recordingSessions'
  | 'onToggleRecording'
  | 'syncInput'
  | 'allSessionIds'
  | 'onToggleSync'
>): SharedTerminalProps {
  return {
    isActive,
    onTitleChange,
    recordingSessions,
    onToggleRecording,
    syncInput,
    allSessionIds,
    onToggleSync,
  }
}

function toSingleTerminalContentProps(
  props: ActiveTerminalContentProps,
): Omit<ActiveTerminalContentProps, 'onCloseSplit'> {
  const { onCloseSplit, ...singleProps } = props
  void onCloseSplit
  return singleProps
}

interface TerminalPaneContentProps extends SharedTerminalProps {
  status: TerminalStatus
  onRestart: (id: string) => void
  onClose: (id: string) => void
}

function createPaneContentProps(args: {
  sharedProps: SharedTerminalProps
  status: TerminalStatus
  sessionId: string
  onRestart: (id: string) => void
  onClose: (id: string) => void
}): TerminalPaneContentProps {
  const { sharedProps, ...paneProps } = args
  return { ...sharedProps, ...paneProps }
}

function TerminalPaneContent({
  status,
  onRestart,
  onClose,
  ...terminalProps
}: TerminalPaneContentProps): React.ReactElement {
  return (
    status === 'running'
      ? <SharedTerminalInstance {...terminalProps} />
      : <TerminalExitedOverlay sessionId={terminalProps.sessionId} onRestart={onRestart} onClose={onClose} />
  )
}

function SplitPaneLayout(props: ActiveTerminalContentProps): React.ReactElement {
  const { splitRatio, containerRef, handleDividerPointerDown } = useSplitResize()
  const splitId = props.session.splitSessionId!
  const closeSplit = () => props.onCloseSplit(props.session.id)
  const sharedProps = getSharedTerminalProps(props)

  return (
    <SplitPaneLayoutFrame
      containerRef={containerRef}
      splitRatio={splitRatio}
      handleDividerPointerDown={handleDividerPointerDown}
      onClose={closeSplit}
      leftPane={(
        <TerminalPaneContent
          {...createPaneContentProps({
            sharedProps,
            status: props.session.status,
            sessionId: props.session.id,
            onRestart: props.onRestart,
            onClose: props.onClose,
          })}
        />
      )}
      rightPane={(
        <TerminalPaneContent
          {...createPaneContentProps({
            sharedProps,
            status: props.session.splitStatus ?? 'running',
            sessionId: splitId,
            onRestart: props.onRestart,
            onClose: closeSplit,
          })}
        />
      )}
    />
  )
}

function SingleTerminalContent(
  props: Omit<ActiveTerminalContentProps, 'onCloseSplit'>,
): React.ReactElement {
  const sharedProps = getSharedTerminalProps(props)

  return (
    props.session.status === 'running'
      ? <SharedTerminalInstance {...sharedProps} sessionId={props.session.id} onSplit={props.onSplit} />
      : <TerminalExitedOverlay sessionId={props.session.id} onRestart={props.onRestart} onClose={props.onClose} />
  )
}

export function ActiveTerminalContent(props: ActiveTerminalContentProps): React.ReactElement {
  return props.session.splitSessionId
    ? <SplitPaneLayout {...props} />
    : <SingleTerminalContent {...toSingleTerminalContentProps(props)} />
}
