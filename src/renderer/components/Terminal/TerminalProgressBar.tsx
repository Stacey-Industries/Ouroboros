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

import React, { useEffect, useState, useRef, useCallback } from 'react'
import type { IProgressState } from '@xterm/addon-progress'

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

export function TerminalProgressBar({ subscribe }: TerminalProgressBarProps): React.ReactElement | null {
  const [display, setDisplay] = useState<ProgressDisplay>({ visualState: 'hidden', value: 0 })
  const fadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearFadeTimer = useCallback(() => {
    if (fadeTimerRef.current !== null) {
      clearTimeout(fadeTimerRef.current)
      fadeTimerRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!subscribe) return

    const disposable = subscribe((progressState: IProgressState) => {
      clearFadeTimer()

      switch (progressState.state) {
        case 0:
          // Remove progress — hide immediately
          setDisplay({ visualState: 'hidden', value: 0 })
          break

        case 1:
          // Normal progress
          if (progressState.value >= 100) {
            // Complete — flash green then fade out
            setDisplay({ visualState: 'complete', value: 100 })
            fadeTimerRef.current = setTimeout(() => {
              setDisplay({ visualState: 'hidden', value: 0 })
            }, FADE_OUT_DELAY_MS)
          } else {
            setDisplay({ visualState: 'normal', value: progressState.value })
          }
          break

        case 2:
          // Error — flash red then fade out
          setDisplay({ visualState: 'error', value: progressState.value || 100 })
          fadeTimerRef.current = setTimeout(() => {
            setDisplay({ visualState: 'hidden', value: 0 })
          }, FADE_OUT_DELAY_MS)
          break

        case 3:
          // Indeterminate
          setDisplay({ visualState: 'indeterminate', value: 0 })
          break

        case 4:
          // Warning / paused
          setDisplay({ visualState: 'warning', value: progressState.value || 50 })
          break
      }
    })

    return () => {
      disposable.dispose()
      clearFadeTimer()
    }
  }, [subscribe, clearFadeTimer])

  // Cleanup on unmount
  useEffect(() => clearFadeTimer, [clearFadeTimer])

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
export function TerminalProgressDot({ subscribe }: TerminalProgressBarProps): React.ReactElement | null {
  const [active, setActive] = useState(false)
  const [isError, setIsError] = useState(false)
  const fadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!subscribe) return

    const disposable = subscribe((progressState: IProgressState) => {
      if (fadeTimerRef.current !== null) {
        clearTimeout(fadeTimerRef.current)
        fadeTimerRef.current = null
      }

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
        // Complete — briefly show then hide
        fadeTimerRef.current = setTimeout(() => {
          setActive(false)
        }, FADE_OUT_DELAY_MS)
      } else {
        setActive(true)
        setIsError(false)
      }
    })

    return () => {
      disposable.dispose()
      if (fadeTimerRef.current !== null) clearTimeout(fadeTimerRef.current)
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
        backgroundColor: isError ? '#ff5555' : 'var(--accent, #55aaff)',
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
    case 'normal': return 'var(--accent, #55aaff)'
    case 'complete': return '#55aa55'
    case 'error': return '#ff5555'
    case 'warning': return '#aaaa55'
    case 'indeterminate': return 'var(--accent, #55aaff)'
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
