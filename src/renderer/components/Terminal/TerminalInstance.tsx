import '@xterm/xterm/css/xterm.css'

import React from 'react'

import {
  TerminalDisconnectedBanner,
  type TerminalDisconnectedInfo,
} from './TerminalDisconnectedBanner'
import type { TerminalInstanceProps } from './TerminalInstanceController'
import { useTerminalInstanceController } from './TerminalInstanceController'
import { TerminalInstanceView } from './TerminalInstanceView'

export type { TerminalInstanceProps } from './TerminalInstanceController'

/** DOM event dispatched to open a new terminal tab (consumed by TerminalManager). */
const NEW_TERMINAL_EVENT = 'agent-ide:new-terminal'

/**
 * Subscribe to pty:disconnected:${id} events for this session and track the
 * most recent disconnect info. Returns null while the session is healthy.
 */
function useDisconnectedInfo(sessionId: string): {
  info: TerminalDisconnectedInfo | null
  dismiss: () => void
} {
  const [info, setInfo] = React.useState<TerminalDisconnectedInfo | null>(null)
  React.useEffect(() => {
    setInfo(null)
    const cleanup = window.electronAPI?.pty?.onDisconnected?.(sessionId, (next) => {
      setInfo(next)
    })
    return cleanup
  }, [sessionId])
  const dismiss = React.useCallback(() => setInfo(null), [])
  return { info, dismiss }
}

export function TerminalInstance(props: TerminalInstanceProps): React.ReactElement {
  const controller = useTerminalInstanceController(props)
  const { info, dismiss } = useDisconnectedInfo(props.sessionId)

  const handleRestart = React.useCallback(() => {
    window.dispatchEvent(new CustomEvent(NEW_TERMINAL_EVENT))
    dismiss()
  }, [dismiss])

  return (
    <div className="relative flex h-full w-full flex-col">
      <TerminalInstanceView controller={controller} />
      {info ? (
        <TerminalDisconnectedBanner info={info} onRestart={handleRestart} onDismiss={dismiss} />
      ) : null}
    </div>
  )
}
