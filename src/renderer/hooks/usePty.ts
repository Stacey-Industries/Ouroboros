/**
 * usePty — PTY session lifecycle hook.
 *
 * Wraps window.electronAPI.pty with React-friendly lifecycle management.
 * All listener cleanups are tracked and run on unmount.
 * Never imports Node modules — all IPC goes through the contextBridge.
 */

import React, { useCallback, useEffect, useRef } from 'react'

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

async function spawnPty(id: string, cwd?: string): Promise<string> {
  const result = await window.electronAPI.pty.spawn(id, { cwd })
  if (!result.success && !result.already) {
    throw new Error(result.error ?? `Failed to spawn PTY session ${id}`)
  }
  return id
}

function makeTrackedSubscriber<T>(
  cleanupsRef: React.MutableRefObject<Set<() => void>>,
  subscribe: (sessionId: string, cb: (arg: T) => void) => () => void,
): (sessionId: string, callback: (arg: T) => void) => () => void {
  return (sessionId, callback) => {
    const cleanup = subscribe(sessionId, callback)
    cleanupsRef.current.add(cleanup)
    return () => {
      cleanup()
      cleanupsRef.current.delete(cleanup)
    }
  }
}

export function usePty(): UsePtyReturn {
  const cleanupsRef = useRef<Set<() => void>>(new Set())

  useEffect(() => {
    const cleanups = cleanupsRef.current
    return () => {
      for (const cleanup of cleanups) cleanup()
      cleanups.clear()
    }
  }, [])

  const spawn = useCallback((id: string, cwd?: string) => spawnPty(id, cwd), [])
  const write = useCallback((sid: string, d: string) => { void window.electronAPI.pty.write(sid, d) }, [])
  const resize = useCallback((sid: string, c: number, r: number) => { void window.electronAPI.pty.resize(sid, c, r) }, [])
  const kill = useCallback((sid: string) => { void window.electronAPI.pty.kill(sid) }, [])
  const onData = useCallback(
    (sessionId: string, callback: (data: string) => void) =>
      makeTrackedSubscriber<string>(cleanupsRef, window.electronAPI.pty.onData)(sessionId, callback),
    []
  )
  const onExit = useCallback(
    (sessionId: string, callback: (result: ExitResult) => void) =>
      makeTrackedSubscriber<ExitResult>(cleanupsRef, window.electronAPI.pty.onExit)(sessionId, callback),
    []
  )

  return { spawn, write, resize, kill, onData, onExit }
}
