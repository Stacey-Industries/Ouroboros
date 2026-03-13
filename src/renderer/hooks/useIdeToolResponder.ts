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

/**
 * Hook that listens for IDE tool queries from the main process and responds
 * with current renderer state.
 */
export function useIdeToolResponder(options: {
  /** Returns list of currently open file tabs */
  getOpenFiles: () => Array<{ path: string; dirty?: boolean }>
  /** Returns the currently active/visible file info */
  getActiveFile: () => { path: string; cursorLine?: number; cursorCol?: number } | null
  /** Returns unsaved content for a file path, or null if not dirty */
  getUnsavedContent: (filePath: string) => string | null
  /** Returns current editor selection text, or null */
  getSelection: () => { text: string; filePath?: string; startLine?: number; endLine?: number } | null
  /** Returns recent terminal output lines */
  getTerminalOutput: (sessionId?: string, lines?: number) => string[]
}): void {
  const { projectRoot } = useProject()
  const optionsRef = useRef(options)
  optionsRef.current = options

  const projectRootRef = useRef(projectRoot)
  projectRootRef.current = projectRoot

  useEffect(() => {
    if (!window.electronAPI.ideTools) return

    const cleanup = window.electronAPI.ideTools.onQuery((query: IdeToolQuery) => {
      const { queryId, method, params } = query
      const opts = optionsRef.current
      const root = projectRootRef.current

      const respond = (result: unknown, error?: string) => {
        window.electronAPI.ideTools.respond(queryId, result, error).catch((err) => {
          console.error('[ideToolResponder] Failed to send response:', err)
        })
      }

      try {
        switch (method) {
          case 'getOpenFiles': {
            respond(opts.getOpenFiles())
            break
          }

          case 'getActiveFile': {
            respond(opts.getActiveFile())
            break
          }

          case 'getUnsavedContent': {
            const p = params as { path?: string } | undefined
            if (!p?.path) {
              respond(null, 'Missing param: path')
              break
            }
            respond(opts.getUnsavedContent(p.path))
            break
          }

          case 'getSelection': {
            respond(opts.getSelection())
            break
          }

          case 'getProjectInfo': {
            respond({
              root,
              name: root ? root.split(/[\\/]/).pop() : null,
            })
            break
          }

          case 'getTerminalOutput': {
            const tp = params as { sessionId?: string; lines?: number } | undefined
            respond(opts.getTerminalOutput(tp?.sessionId, tp?.lines))
            break
          }

          case 'getAllDiagnostics': {
            // LSP diagnostics are managed in the main process; return empty from renderer
            respond([])
            break
          }

          default:
            respond(null, `Unknown renderer query method: ${method}`)
        }
      } catch (err) {
        respond(null, (err as Error).message || String(err))
      }
    })

    return cleanup
  }, [])
}
