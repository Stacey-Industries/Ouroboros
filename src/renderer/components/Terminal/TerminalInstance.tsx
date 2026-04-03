import '@xterm/xterm/css/xterm.css'

import React from 'react'

import type { TerminalInstanceProps } from './TerminalInstanceController'
import { useTerminalInstanceController } from './TerminalInstanceController'
import { TerminalInstanceView } from './TerminalInstanceView'

export type { TerminalInstanceProps } from './TerminalInstanceController'

export function TerminalInstance(props: TerminalInstanceProps): React.ReactElement {
  const controller = useTerminalInstanceController(props)
  return <TerminalInstanceView controller={controller} />
}
