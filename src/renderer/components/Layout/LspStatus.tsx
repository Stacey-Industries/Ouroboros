/**
 * LspStatus.tsx — Small status indicator showing which language servers are running.
 *
 * Displays in the status bar area. Shows server count and status with a tooltip
 * listing each active server.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react'
import type { LspServerStatus, LspServerStatusType } from '../../types/electron'

const STATUS_COLORS: Record<LspServerStatusType, string> = {
  starting: 'var(--warning, #e5c07b)',
  running: 'var(--success, #98c379)',
  error: 'var(--error, #e06c75)',
  stopped: 'var(--text-secondary)',
}

const triggerStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '5px',
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  fontSize: '11px',
  fontFamily: 'var(--font-mono)',
  padding: '2px 6px',
  borderRadius: '3px',
  transition: 'background 120ms',
}

const tooltipStyle: React.CSSProperties = {
  position: 'absolute',
  bottom: '100%',
  right: 0,
  marginBottom: '6px',
  minWidth: '220px',
  borderRadius: '6px',
  boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
  padding: '8px 0',
  zIndex: 1000,
}

const tooltipHeaderStyle: React.CSSProperties = {
  padding: '4px 12px 8px',
  fontSize: '11px',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
}

const tooltipRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  padding: '6px 12px',
  fontSize: '12px',
}

const hoverBackground = 'color-mix(in srgb, var(--text-primary) 8%, transparent)'

function useLspServers(): LspServerStatus[] {
  const [servers, setServers] = useState<LspServerStatus[]>([])

  useEffect(() => {
    window.electronAPI.lsp.getStatus().then((result) => {
      if (result.success && result.servers) setServers(result.servers)
    })

    return window.electronAPI.lsp.onStatusChange((updatedServers) => {
      setServers(updatedServers)
    })
  }, [])

  return servers
}

function useDismissOnOutsideClick(
  ref: React.RefObject<HTMLDivElement | null>,
  isOpen: boolean,
  onDismiss: () => void,
): void {
  useEffect(() => {
    if (!isOpen) return

    function handleClick(event: MouseEvent): void {
      if (ref.current && !ref.current.contains(event.target as Node)) onDismiss()
    }

    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [isOpen, onDismiss, ref])
}

function getDotColor(servers: LspServerStatus[]): string {
  if (servers.some((server) => server.status === 'error')) return STATUS_COLORS.error
  if (servers.some((server) => server.status === 'starting')) return STATUS_COLORS.starting
  return STATUS_COLORS.running
}

function LspTooltipRow({ server }: { server: LspServerStatus }): React.ReactElement {
  return (
    <div style={tooltipRowStyle}>
      <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: STATUS_COLORS[server.status], flexShrink: 0 }} />
      <span className="text-text-semantic-primary" style={{ fontWeight: 500 }}>{server.language}</span>
      <span className="text-text-semantic-muted" style={{ fontSize: '10px', marginLeft: 'auto' }}>
        {server.status}
      </span>
    </div>
  )
}

function LspTooltip({ servers }: { servers: LspServerStatus[] }): React.ReactElement {
  return (
    <div className="bg-surface-panel border border-border-semantic" style={tooltipStyle}>
      <div className="text-text-semantic-muted border-b border-border-semantic" style={tooltipHeaderStyle}>Language Servers</div>
      {servers.map((server) => (
        <LspTooltipRow key={`${server.root}::${server.language}`} server={server} />
      ))}
    </div>
  )
}

interface LspStatusTriggerProps {
  dotColor: string
  runningCount: number
  totalCount: number
  onClick: () => void
}

function LspStatusTrigger({
  dotColor,
  runningCount,
  totalCount,
  onClick,
}: LspStatusTriggerProps): React.ReactElement {
  const handleMouseEnter = useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
    event.currentTarget.style.background = hoverBackground
  }, [])

  const handleMouseLeave = useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
    event.currentTarget.style.background = 'none'
  }, [])

  return (
    <button onClick={onClick} title="Language servers" className="text-text-semantic-muted" style={triggerStyle} onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}>
      <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: dotColor, flexShrink: 0 }} />
      <span>LSP {runningCount}/{totalCount}</span>
    </button>
  )
}

export function LspStatus(): React.ReactElement | null {
  const servers = useLspServers()
  const [showTooltip, setShowTooltip] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useDismissOnOutsideClick(containerRef, showTooltip, () => setShowTooltip(false))

  if (servers.length === 0) return null

  const runningCount = servers.filter((server) => server.status === 'running').length
  const dotColor = getDotColor(servers)

  return (
    <div ref={containerRef} style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
      <LspStatusTrigger
        dotColor={dotColor}
        runningCount={runningCount}
        totalCount={servers.length}
        onClick={() => setShowTooltip((prev) => !prev)}
      />
      {showTooltip && <LspTooltip servers={servers} />}
    </div>
  )
}
