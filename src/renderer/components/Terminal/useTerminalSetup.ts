import { useEffect } from 'react'
import {
  createBootstrapTerminal,
} from './useTerminalSetup.lifecycle'
import {
  useTerminalFitHandlers,
  useTerminalSetupRuntimeRefs,
} from './useTerminalSetup.runtime'
import type { UseTerminalSetupParams } from './useTerminalSetup.shared'

export type {
  HandleTabCompletionRef,
  SetupCallbacks,
  TerminalRefs,
  UseTerminalSetupParams,
} from './useTerminalSetup.shared'

export function useTerminalSetup(params: UseTerminalSetupParams): {
  fit: () => void
  syncTheme: () => void
} {
  const runtimeRefs = useTerminalSetupRuntimeRefs()
  const { fit, syncTheme } = useTerminalFitHandlers(
    params.sessionId,
    params.refs,
    runtimeRefs,
  )
  const bootstrapTerminal = createBootstrapTerminal({
    ...params,
    runtimeRefs,
    fit,
  })

  useEffect(() => {
    const container = params.refs.containerRef.current
    if (!container) return
    return bootstrapTerminal(container)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.sessionId])

  return { fit, syncTheme }
}
