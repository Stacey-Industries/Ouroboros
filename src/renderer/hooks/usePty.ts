/**
 * usePty — PTY session lifecycle hook.
 *
 * Wraps window.electronAPI.pty with React-friendly lifecycle management.
 * All listener cleanups are tracked and run on unmount.
 * Never imports Node modules — all IPC goes through the contextBridge.
 */

import { useCallback, useEffect, useRef } from 'react'

type ExitResult = { exitCode: number | null; signal: number | null }

interface UsePtyReturn {
  /** Spawn a new PTY session. Returns the session ID. */
  spawn: (id: string, cwd?: string) => Promise<string>
  /** Write data to a PTY session. */
  write: (sessionId: string, data: string) => void
  /** Resize a PTY session. */
  resize: (sessionId: string, cols: number, rows: number) => void
  /** Kill a PTY session. */
  kill: (sessionId: string) => void
  /**
   * Subscribe to data events for a session.
   * Returns a cleanup function — call it to unsubscribe.
   */
  onData: (sessionId: string, callback: (data: string) => void) => () => void
  /**
   * Subscribe to exit events for a session.
   * Returns a cleanup function — call it to unsubscribe.
   */
  onExit: (sessionId: string, callback: (result: ExitResult) => void) => () => void
}

export function usePty(): UsePtyReturn {
  // Track all active listener cleanups so we can tear them down on unmount.
  const cleanupsRef = useRef<Set<() => void>>(new Set())

  useEffect(() => {
    const cleanups = cleanupsRef.current
    return () => {
      for (const cleanup of cleanups) {
        cleanup()
      }
      cleanups.clear()
    }
  }, [])

  const spawn = useCallback(async (id: string, cwd?: string): Promise<string> => {
    const result = await window.electronAPI.pty.spawn(id, { cwd })
    if (!result.success && !result.already) {
      throw new Error(result.error ?? `Failed to spawn PTY session ${id}`)
    }
    return id
  }, [])

  const write = useCallback((sessionId: string, data: string): void => {
    // Fire-and-forget — callers write at high frequency (keystroke-level)
    void window.electronAPI.pty.write(sessionId, data)
  }, [])

  const resize = useCallback((sessionId: string, cols: number, rows: number): void => {
    void window.electronAPI.pty.resize(sessionId, cols, rows)
  }, [])

  const kill = useCallback((sessionId: string): void => {
    void window.electronAPI.pty.kill(sessionId)
  }, [])

  const onData = useCallback(
    (sessionId: string, callback: (data: string) => void): (() => void) => {
      const cleanup = window.electronAPI.pty.onData(sessionId, callback)
      cleanupsRef.current.add(cleanup)
      return () => {
        cleanup()
        cleanupsRef.current.delete(cleanup)
      }
    },
    []
  )

  const onExit = useCallback(
    (sessionId: string, callback: (result: ExitResult) => void): (() => void) => {
      const cleanup = window.electronAPI.pty.onExit(sessionId, callback)
      cleanupsRef.current.add(cleanup)
      return () => {
        cleanup()
        cleanupsRef.current.delete(cleanup)
      }
    },
    []
  )

  return { spawn, write, resize, kill, onData, onExit }
}
