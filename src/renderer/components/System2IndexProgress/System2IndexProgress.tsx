/**
 * System2IndexProgress.tsx — Unobtrusive toast showing System 2 initial index progress.
 *
 * Mounts at the app root and listens for `system2:indexProgress` events.
 * Renders a compact fixed-position indicator in the bottom-right corner
 * while indexing is active, and disappears on completion or error.
 */

import React, { useEffect, useReducer } from 'react';

import type { System2IndexProgressEvent } from '../../types/electron';

// ── State ──────────────────────────────────────────────────────────────────

interface IndexState {
  active: boolean
  projectName: string
  phase: string
  filesProcessed: number
  filesTotal: number
  reason: string
}

type Action =
  | { type: 'start'; event: Extract<System2IndexProgressEvent, { kind: 'start' }> }
  | { type: 'progress'; event: Extract<System2IndexProgressEvent, { kind: 'progress' }> }
  | { type: 'done' }

const INITIAL: IndexState = {
  active: false,
  projectName: '',
  phase: '',
  filesProcessed: 0,
  filesTotal: 0,
  reason: '',
}

function reducer(state: IndexState, action: Action): IndexState {
  switch (action.type) {
    case 'start':
      return {
        active: true,
        projectName: action.event.projectName,
        phase: 'starting',
        filesProcessed: 0,
        filesTotal: 0,
        reason: action.event.reason,
      }
    case 'progress':
      return {
        ...state,
        phase: action.event.phase,
        filesProcessed: action.event.filesProcessed,
        filesTotal: action.event.filesTotal,
      }
    case 'done':
      return INITIAL
    default:
      return state
  }
}

// ── Component ──────────────────────────────────────────────────────────────

function useIndexProgressState(): IndexState {
  const [state, dispatch] = useReducer(reducer, INITIAL)

  useEffect(() => {
    if (!window.electronAPI?.system2) return

    return window.electronAPI.system2.onIndexProgress((event) => {
      if (event.kind === 'start') {
        dispatch({ type: 'start', event })
      } else if (event.kind === 'progress') {
        dispatch({ type: 'progress', event })
      } else {
        dispatch({ type: 'done' })
      }
    })
  }, [])

  return state
}

function ProgressBar({ processed, total }: { processed: number; total: number }): React.ReactElement {
  const pct = total > 0 ? Math.min(100, Math.round((processed / total) * 100)) : 0
  return (
    <div className="mt-1 h-1 w-full rounded-full bg-surface-inset overflow-hidden">
      <div
        className="h-full rounded-full bg-interactive-accent transition-all duration-200"
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

export function System2IndexProgress(): React.ReactElement | null {
  const state = useIndexProgressState()

  if (!state.active) return null

  const label = state.filesTotal > 0
    ? `${state.filesProcessed} / ${state.filesTotal} files`
    : state.phase

  return (
    <div
      role="status"
      aria-live="polite"
      className={
        'fixed bottom-6 right-4 z-50 w-64 rounded-lg px-3 py-2 shadow-lg ' +
        'bg-surface-raised border border-border-semantic'
      }
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-text-semantic-primary truncate max-w-[160px]">
          Indexing {state.projectName}
        </span>
        <span className="text-xs text-text-semantic-muted ml-2 shrink-0">{label}</span>
      </div>
      <ProgressBar processed={state.filesProcessed} total={state.filesTotal} />
    </div>
  )
}
