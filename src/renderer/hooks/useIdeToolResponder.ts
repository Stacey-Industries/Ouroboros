/**
 * useIdeToolResponder.ts — Responds to IDE tool server queries from the main process.
 *
 * The main process (ideToolServer.ts) sends `ide:query` events when Claude Code
 * hook scripts ask for IDE context. This hook listens for those queries and
 * sends back responses with the requested data from the renderer's current state.
 *
 * Usage: call useIdeToolResponder({ ... }) once in App.tsx (or a top-level component).
 */

import { useEffect, useRef } from 'react'

import { useProject } from '../contexts/ProjectContext'
import type { IdeToolQuery } from '../types/electron'

interface IdeToolResponderOptions {
  getOpenFiles: () => Array<{ path: string; dirty?: boolean }>
  getActiveFile: () => { path: string; cursorLine?: number; cursorCol?: number } | null
  getUnsavedContent: (filePath: string) => string | null
  getSelection: () => { text: string; filePath?: string; startLine?: number; endLine?: number } | null
  getTerminalOutput: (sessionId?: string, lines?: number) => string[]
}

type IdeToolRespond = (result: unknown, error?: string) => void
type IdeToolHandler = (
  params: unknown,
  context: { options: IdeToolResponderOptions; projectRoot: string | null; respond: IdeToolRespond },
) => void

function useLatestRef<T>(value: T) {
  const ref = useRef(value)
  ref.current = value
  return ref
}

function createResponder(queryId: string): IdeToolRespond {
  return (result, error) => {
    window.electronAPI.ideTools.respond(queryId, result, error).catch((err) => {
      console.error('[ideToolResponder] Failed to send response:', err)
    })
  }
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function getProjectInfo(projectRoot: string | null) {
  return {
    root: projectRoot,
    name: projectRoot ? projectRoot.split(/[\\/]/).pop() ?? null : null,
  }
}

function getPathParam(params: unknown): string | null {
  const path = (params as { path?: unknown } | undefined)?.path
  return typeof path === 'string' ? path : null
}

function getTerminalOutputParams(params: unknown): { sessionId?: string; lines?: number } {
  const values = params as { sessionId?: unknown; lines?: unknown } | undefined
  return {
    sessionId: typeof values?.sessionId === 'string' ? values.sessionId : undefined,
    lines: typeof values?.lines === 'number' ? values.lines : undefined,
  }
}

const ideToolHandlers: Record<string, IdeToolHandler> = {
  getOpenFiles: (_params, context) => context.respond(context.options.getOpenFiles()),
  getActiveFile: (_params, context) => context.respond(context.options.getActiveFile()),
  getUnsavedContent: (params, context) => {
    const filePath = getPathParam(params)
    if (!filePath) {
      context.respond(null, 'Missing param: path')
      return
    }
    context.respond(context.options.getUnsavedContent(filePath))
  },
  getSelection: (_params, context) => context.respond(context.options.getSelection()),
  getProjectInfo: (_params, context) => context.respond(getProjectInfo(context.projectRoot)),
  getTerminalOutput: (params, context) => {
    const { sessionId, lines } = getTerminalOutputParams(params)
    context.respond(context.options.getTerminalOutput(sessionId, lines))
  },
  getAllDiagnostics: (_params, context) => context.respond([]),
}

function handleIdeToolQuery(
  query: IdeToolQuery,
  options: IdeToolResponderOptions,
  projectRoot: string | null,
): void {
  const respond = createResponder(query.queryId)
  const handler = ideToolHandlers[query.method]

  if (!handler) {
    respond(null, `Unknown renderer query method: ${query.method}`)
    return
  }

  try {
    handler(query.params, { options, projectRoot, respond })
  } catch (error) {
    respond(null, getErrorMessage(error))
  }
}

export function useIdeToolResponder(options: IdeToolResponderOptions): void {
  const { projectRoot } = useProject()
  const optionsRef = useLatestRef(options)
  const projectRootRef = useLatestRef(projectRoot)

  useEffect(() => {
    if (!window.electronAPI.ideTools) return
    return window.electronAPI.ideTools.onQuery((query) => {
      handleIdeToolQuery(query, optionsRef.current, projectRootRef.current)
    })
  }, [optionsRef, projectRootRef])
}
