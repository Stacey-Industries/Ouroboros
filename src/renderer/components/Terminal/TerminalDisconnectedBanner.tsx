import React from 'react'

export interface TerminalDisconnectedInfo {
  reason: string
  exitCode: number
  scrollback: string[]
}

export interface TerminalDisconnectedBannerProps {
  info: TerminalDisconnectedInfo
  onRestart: () => void
  onDismiss: () => void
}

function BannerHeader(props: {
  info: TerminalDisconnectedInfo
  onRestart: () => void
  onDismiss: () => void
}): React.ReactElement {
  const { info, onRestart, onDismiss } = props
  return (
    <div className="flex items-center justify-between border-b border-border-subtle bg-status-warning-subtle px-4 py-2">
      <div className="flex flex-col">
        <span className="text-sm font-semibold text-status-warning">Terminal disconnected</span>
        <span className="text-xs text-text-semantic-muted">
          PtyHost process exited (code {info.exitCode}) — session state lost. Scrollback preserved below.
        </span>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onRestart}
          className="rounded border border-border-semantic bg-interactive-accent px-3 py-1 text-xs font-medium text-text-semantic-on-accent hover:bg-interactive-accent-hover"
        >
          New terminal
        </button>
        <button
          type="button"
          onClick={onDismiss}
          className="rounded border border-border-subtle bg-surface-raised px-3 py-1 text-xs text-text-semantic-secondary hover:bg-surface-hover"
        >
          Dismiss
        </button>
      </div>
    </div>
  )
}

/**
 * Overlay banner shown when a PTY session is disconnected because the PtyHost
 * utility process crashed. Displays the recent scrollback (read-only) preserved
 * in main-process `terminalOutputBuffer` and offers a restart action.
 *
 * Backend emits the `pty:disconnected:${id}` event with `{ reason, exitCode,
 * scrollback }`; the consumer listens via `window.electronAPI.pty.onDisconnected`.
 */
export function TerminalDisconnectedBanner(
  props: TerminalDisconnectedBannerProps,
): React.ReactElement {
  const { info, onRestart, onDismiss } = props
  return (
    <div
      role="alert"
      aria-live="polite"
      className="absolute inset-0 z-30 flex flex-col bg-surface-overlay backdrop-blur-sm"
    >
      <BannerHeader info={info} onRestart={onRestart} onDismiss={onDismiss} />
      <pre
        className="m-0 flex-1 overflow-auto whitespace-pre-wrap break-words bg-surface-inset p-3 font-mono text-xs text-text-semantic-muted"
        data-testid="terminal-disconnected-scrollback"
      >
        {info.scrollback.length > 0 ? info.scrollback.join('\n') : '(no scrollback captured)'}
      </pre>
    </div>
  )
}
