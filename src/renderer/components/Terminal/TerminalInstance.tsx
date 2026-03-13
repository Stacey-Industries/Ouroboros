import React from 'react'
import '@xterm/xterm/css/xterm.css'
import { useTerminalInstanceController } from './TerminalInstanceController'
import { TerminalInstanceView } from './TerminalInstanceView'
import type { TerminalInstanceProps } from './TerminalInstanceController'

export type { TerminalInstanceProps } from './TerminalInstanceController'

export function TerminalInstance(props: TerminalInstanceProps): React.ReactElement {
  const controller = useTerminalInstanceController(props)
  return <TerminalInstanceView controller={controller} />
}
