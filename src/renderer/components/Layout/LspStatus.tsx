/**
 * LspStatus.tsx — Small status indicator showing which language servers are running.
 *
 * Displays in the status bar area. Shows server count and status with a tooltip
 * listing each active server.
 */

import React, { useEffect, useState, useRef } from 'react'
import type { LspServerStatus } from '../../types/electron'

const STATUS_COLORS: Record<string, string> = {
  starting: 'var(--warning, #e5c07b)',
  running: 'var(--success, #98c379)',
  error: 'var(--error, #e06c75)',
  stopped: 'var(--text-muted)',
}

export function LspStatus(): React.ReactElement | null {
  const [servers, setServers] = useState<LspServerStatus[]>([])
  const [showTooltip, setShowTooltip] = useState(false)
  const tooltipRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // Initial fetch
    window.electronAPI.lsp.getStatus().then((result) => {
      if (result.success && result.servers) {
        setServers(result.servers)
      }
    })

    // Listen for status changes
    const cleanup = window.electronAPI.lsp.onStatusChange((updatedServers) => {
      setServers(updatedServers)
    })

    return cleanup
  }, [])

  // Close tooltip on click outside
  useEffect(() => {
    if (!showTooltip) return

    function handleClick(e: MouseEvent): void {
      if (tooltipRef.current && !tooltipRef.current.contains(e.target as Node)) {
        setShowTooltip(false)
      }
    }

    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [showTooltip])

  if (servers.length === 0) {
    return null
  }

  const runningCount = servers.filter((s) => s.status === 'running').length
  const hasError = servers.some((s) => s.status === 'error')
  const hasStarting = servers.some((s) => s.status === 'starting')

  const dotColor = hasError
    ? STATUS_COLORS.error
    : hasStarting
      ? STATUS_COLORS.starting
      : STATUS_COLORS.running

  return (
    <div
      ref={tooltipRef}
      style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}
    >
      <button
        onClick={() => setShowTooltip((prev) => !prev)}
        title="Language servers"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '5px',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: 'var(--text-muted)',
          fontSize: '11px',
          fontFamily: 'var(--font-mono)',
          padding: '2px 6px',
          borderRadius: '3px',
          transition: 'background 120ms',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'color-mix(in srgb, var(--text) 8%, transparent)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'none'
        }}
      >
        <span
          style={{
            width: '7px',
            height: '7px',
            borderRadius: '50%',
            background: dotColor,
            flexShrink: 0,
          }}
        />
        <span>LSP {runningCount}/{servers.length}</span>
      </button>

      {showTooltip && (
        <div
          style={{
            position: 'absolute',
            bottom: '100%',
            right: 0,
            marginBottom: '6px',
            minWidth: '220px',
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border)',
            borderRadius: '6px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
            padding: '8px 0',
            zIndex: 1000,
          }}
        >
          <div
            style={{
              padding: '4px 12px 8px',
              fontSize: '11px',
              fontWeight: 600,
              color: 'var(--text-muted)',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              borderBottom: '1px solid var(--border)',
            }}
          >
            Language Servers
          </div>
          {servers.map((server) => (
            <div
              key={`${server.root}::${server.language}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '6px 12px',
                fontSize: '12px',
              }}
            >
              <span
                style={{
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  background: STATUS_COLORS[server.status] ?? STATUS_COLORS.stopped,
                  flexShrink: 0,
                }}
              />
              <span style={{ color: 'var(--text)', fontWeight: 500 }}>
                {server.language}
              </span>
              <span
                style={{
                  color: 'var(--text-muted)',
                  fontSize: '10px',
                  marginLeft: 'auto',
                }}
              >
                {server.status}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
