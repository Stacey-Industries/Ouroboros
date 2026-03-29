/**
 * TerminalProgressBar — thin progress bar rendered at the bottom of the terminal container.
 *
 * Subscribes to xterm's ProgressAddon (OSC 9;4 ConEmu protocol) and renders
 * visual feedback for long-running operations like npm install, pip, cargo build.
 *
 * States:
 *   0 = hidden (no active progress)
 *   1 = normal percentage (0-100% fill)
 *   2 = error (flash red, fade out)
 *   3 = indeterminate (pulsing animation)
 *   4 = warning/paused (yellow bar)
 */

import type { IProgressState } from '@xterm/addon-progress'
import React, { useEffect, useRef, useState } from 'react'

export interface TerminalProgressBarProps {
  /** Subscribe to progress changes. Returns a dispose function. */
  subscribe: ((cb: (state: IProgressState) => void) => { dispose(): void }) | null
}

type VisualState = 'hidden' | 'normal' | 'indeterminate' | 'error' | 'warning' | 'complete'

interface ProgressDisplay {
  visualState: VisualState
  value: number
}

const FADE_OUT_DELAY_MS = 2000

function clearTimer(ref: React.MutableRefObject<ReturnType<typeof setTimeout> | null>): void {
  if (ref.current !== null) {
    clearTimeout(ref.current)
    ref.current = null
  }
}

function scheduleHide(ref: React.MutableRefObject<ReturnType<typeof setTimeout> | null>, fn: () => void): void {
  ref.current = setTimeout(fn, FADE_OUT_DELAY_MS)
}

function handleProgressState(
  progressState: IProgressState,
  setDisplay: React.Dispatch<React.SetStateAction<ProgressDisplay>>,
  fadeTimerRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>,
): void {
  clearTimer(fadeTimerRef)
  if (progressState.state === 0) {
    setDisplay({ visualState: 'hidden', value: 0 })
  } else if (progressState.state === 1) {
    if (progressState.value >= 100) {
      setDisplay({ visualState: 'complete', value: 100 })
      scheduleHide(fadeTimerRef, () => setDisplay({ visualState: 'hidden', value: 0 }))
    } else {
      setDisplay({ visualState: 'normal', value: progressState.value })
    }
  } else if (progressState.state === 2) {
    setDisplay({ visualState: 'error', value: progressState.value || 100 })
    scheduleHide(fadeTimerRef, () => setDisplay({ visualState: 'hidden', value: 0 }))
  } else if (progressState.state === 3) {
    setDisplay({ visualState: 'indeterminate', value: 0 })
  } else if (progressState.state === 4) {
    setDisplay({ visualState: 'warning', value: progressState.value || 50 })
  }
}

function handleProgressDotState(
  progressState: IProgressState,
  setActive: React.Dispatch<React.SetStateAction<boolean>>,
  setIsError: React.Dispatch<React.SetStateAction<boolean>>,
  fadeTimerRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>,
): void {
  clearTimer(fadeTimerRef)
  if (progressState.state === 0) {
    setActive(false)
    setIsError(false)
  } else if (progressState.state === 2) {
    setActive(true)
    setIsError(true)
    fadeTimerRef.current = setTimeout(() => {
      setActive(false)
      setIsError(false)
    }, FADE_OUT_DELAY_MS)
  } else if (progressState.state === 1 && progressState.value >= 100) {
    fadeTimerRef.current = setTimeout(() => setActive(false), FADE_OUT_DELAY_MS)
  } else {
    setActive(true)
    setIsError(false)
  }
}

export function TerminalProgressBar({ subscribe }: TerminalProgressBarProps): React.ReactElement<any> | null {
  const [display, setDisplay] = useState<ProgressDisplay>({ visualState: 'hidden', value: 0 })
  const fadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!subscribe) return
    const disposable = subscribe((progressState) => handleProgressState(progressState, setDisplay, fadeTimerRef))
    return () => {
      disposable.dispose()
      clearTimer(fadeTimerRef)
    }
  }, [subscribe])

  if (display.visualState === 'hidden') return null

  return (
    <div
      className="terminal-progress-bar"
      style={containerStyle}
      role="progressbar"
      aria-valuenow={display.visualState === 'indeterminate' ? undefined : display.value}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={display.visualState === 'indeterminate' ? 'terminal-progress-bar-indeterminate' : undefined}
        style={getFillStyle(display)}
      />
    </div>
  )
}

/** Tiny dot indicator for terminal tabs when progress is active */
export function TerminalProgressDot({ subscribe }: TerminalProgressBarProps): React.ReactElement<any> | null {
  const [active, setActive] = useState(false)
  const [isError, setIsError] = useState(false)
  const fadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!subscribe) return
    const disposable = subscribe((progressState) => handleProgressDotState(progressState, setActive, setIsError, fadeTimerRef))
    return () => {
      disposable.dispose()
      clearTimer(fadeTimerRef)
    }
  }, [subscribe])

  if (!active) return null

  return (
    <span
      className="terminal-progress-dot"
      style={{
        display: 'inline-block',
        width: '6px',
        height: '6px',
        borderRadius: '50%',
        backgroundColor: isError ? 'var(--status-error)' : 'var(--interactive-accent)',
        flexShrink: 0,
        animation: 'terminal-progress-pulse 1.5s ease-in-out infinite',
      }}
      aria-label="Task in progress"
    />
  )
}

// ─── Styles ────────────────────────────────────────────────────────────────────

const containerStyle: React.CSSProperties = {
  position: 'absolute',
  bottom: 0,
  left: 0,
  right: 0,
  height: '3px',
  zIndex: 10,
  overflow: 'hidden',
  backgroundColor: 'transparent',
  pointerEvents: 'none',
}

function getBarColor(visualState: VisualState): string {
  switch (visualState) {
    case 'normal': return 'var(--interactive-accent)'
    case 'complete': return 'var(--status-success)'
    case 'error': return 'var(--status-error)'
    case 'warning': return 'var(--status-warning)'
    case 'indeterminate': return 'var(--interactive-accent)'
    default: return 'transparent'
  }
}

function getFillStyle(display: ProgressDisplay): React.CSSProperties {
  const color = getBarColor(display.visualState)

  if (display.visualState === 'indeterminate') {
    return {
      height: '100%',
      width: '30%',
      backgroundColor: color,
      borderRadius: '1px',
    }
  }

  return {
    height: '100%',
    width: `${Math.min(display.value, 100)}%`,
    backgroundColor: color,
    borderRadius: '1px',
    transition: 'width 0.3s ease, background-color 0.3s ease',
  }
}
