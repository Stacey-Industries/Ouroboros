import React, { memo, useCallback, useEffect, useRef, useState } from 'react';

import { useToastContext } from '../../contexts/ToastContext';
import type { AgentSession } from './types';
import { useElapsedSeconds } from './useElapsedSeconds';

export type CardView = 'feed' | 'timeline';

const STATUS_CONFIG = {
  idle: { label: 'Idle', dotColor: 'var(--text-faint)', pulse: false },
  running: { label: 'Running', dotColor: 'var(--accent)', pulse: true },
  complete: { label: 'Done', dotColor: 'var(--success)', pulse: false },
  error: { label: 'Error', dotColor: 'var(--error)', pulse: false },
} as const;

const VIEW_OPTIONS: CardView[] = ['feed', 'timeline'];
const SPIN_KEYFRAMES = '@keyframes spin { to { transform: rotate(360deg); } }';

interface ActionIconButtonProps {
  title: string;
  ariaLabel: string;
  color: string;
  hoverColor?: string;
  onClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
  children: React.ReactNode;
}

interface StatusBadgeProps {
  status: AgentSession['status'];
}

interface RunningProgressProps {
  startedAt: number;
  completedToolCallCount: number;
}

interface ViewToggleProps {
  view: CardView;
  onChange: (view: CardView) => void;
}

interface ChevronIconProps {
  open: boolean;
}

interface DismissButtonProps {
  sessionId: string;
  onDismiss: (id: string) => void;
}

interface ExportButtonProps {
  session: AgentSession;
}

export function useElapsedMs(startedAt: number, running: boolean): number {
  const [elapsed, setElapsed] = useState(() => Date.now() - startedAt);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    if (!running) {
      setElapsed(Date.now() - startedAt);
      return;
    }

    let active = true;
    const tick = (): void => {
      if (!active) return;
      setElapsed(Date.now() - startedAt);
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      active = false;
      cancelAnimationFrame(rafRef.current);
    };
  }, [startedAt, running]);

  return elapsed;
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.floor((ms % 60_000) / 1000);
  return `${minutes}m ${seconds}s`;
}

export function getCardContainerStyle(status: AgentSession['status']): React.CSSProperties {
  return {
    borderColor: 'var(--border-muted)',
    borderLeft: status === 'error' ? '3px solid var(--error)' : '3px solid transparent',
    opacity: status === 'complete' ? 0.7 : 1,
    transition: 'opacity 200ms ease',
  };
}

export function ActionIconButton({
  title,
  ariaLabel,
  color,
  hoverColor,
  onClick,
  children,
}: ActionIconButtonProps): React.ReactElement {
  return (
    <button
      title={title}
      aria-label={ariaLabel}
      onClick={onClick}
      className="shrink-0 p-0.5 rounded transition-colors"
      style={{ color, background: 'transparent', border: 'none', cursor: 'pointer' }}
      onMouseEnter={(event) => {
        if (hoverColor) event.currentTarget.style.color = hoverColor;
      }}
      onMouseLeave={(event) => {
        if (hoverColor) event.currentTarget.style.color = color;
      }}
    >
      {children}
    </button>
  );
}

export const StatusBadge = memo(function StatusBadge({ status }: StatusBadgeProps): React.ReactElement {
  const config = STATUS_CONFIG[status];

  return (
    <span className="inline-flex items-center gap-1">
      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: config.dotColor, animation: config.pulse ? 'pulse 1.5s ease-in-out infinite' : undefined }} />
      <span className="text-[10px] font-medium" style={{ color: config.dotColor }}>
        {config.label}
      </span>
    </span>
  );
});

function formatElapsedLabel(elapsedSeconds: number): string {
  const minutes = Math.floor(elapsedSeconds / 60);
  const seconds = elapsedSeconds % 60;
  return minutes > 0 ? `${minutes}m ${seconds.toString().padStart(2, '0')}s` : `${seconds}s`;
}

function SpinnerIcon(): React.ReactElement {
  return (
    <>
      <style>{SPIN_KEYFRAMES}</style>
      <svg width="11" height="11" viewBox="0 0 11 11" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" style={{ animation: 'spin 0.9s linear infinite', flexShrink: 0 }}>
        <circle cx="5.5" cy="5.5" r="4" stroke="var(--accent)" strokeWidth="1.5" strokeDasharray="12 8" strokeLinecap="round" />
      </svg>
    </>
  );
}

function RunningCallCount({ count }: { count: number }): React.ReactElement | null {
  if (count < 1) return null;

  return (
    <span className="text-[10px] tabular-nums" style={{ color: 'var(--text-faint)' }}>
      {'\u00b7'} {count} call{count === 1 ? '' : 's'}
    </span>
  );
}

export const RunningProgress = memo(function RunningProgress({
  startedAt,
  completedToolCallCount,
}: RunningProgressProps): React.ReactElement {
  const elapsedLabel = formatElapsedLabel(useElapsedSeconds(startedAt, true));

  return (
    <span className="inline-flex items-center gap-1 shrink-0" aria-label={`Running for ${elapsedLabel}, ${completedToolCallCount} tool calls completed`}>
      <SpinnerIcon />
      <span className="text-[10px] tabular-nums" style={{ color: 'var(--accent)', opacity: 0.85 }}>
        {elapsedLabel}
      </span>
      <RunningCallCount count={completedToolCallCount} />
    </span>
  );
});

export const ViewToggle = memo(function ViewToggle({ view, onChange }: ViewToggleProps): React.ReactElement {
  return (
    <div className="inline-flex items-center rounded overflow-hidden shrink-0" style={{ border: '1px solid var(--border-muted)' }}>
      {VIEW_OPTIONS.map((option) => {
        const active = view === option;

        return (
          <button
            key={option}
            onClick={(event) => {
              event.stopPropagation();
              onChange(option);
            }}
            className="px-2 py-0.5 text-[10px] font-medium transition-colors"
            style={{ background: active ? 'var(--accent)' : 'transparent', color: active ? 'var(--text-on-accent)' : 'var(--text-faint)', border: 'none', cursor: 'pointer', lineHeight: '1.4' }}
            title={option === 'feed' ? 'Tool call feed' : 'Gantt timeline'}
          >
            {option === 'feed' ? 'Feed' : 'Timeline'}
          </button>
        );
      })}
    </div>
  );
});

export const ChevronIcon = memo(function ChevronIcon({ open }: ChevronIconProps): React.ReactElement {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 150ms ease' }}>
      <path d="M4 2.5L7.5 6L4 9.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
});

export const DismissButton = memo(function DismissButton({
  sessionId,
  onDismiss,
}: DismissButtonProps): React.ReactElement {
  const handleClick = useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    onDismiss(sessionId);
  }, [onDismiss, sessionId]);

  return (
    <ActionIconButton title="Dismiss" ariaLabel="Dismiss session" color="var(--text-faint)" hoverColor="var(--text)" onClick={handleClick}>
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
        <path d="M1.5 1.5L8.5 8.5M8.5 1.5L1.5 8.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    </ActionIconButton>
  );
});

function useOutsideClick(
  ref: React.RefObject<HTMLDivElement | null>,
  open: boolean,
  onClose: () => void,
): void {
  useEffect(() => {
    if (!open) return;

    function handleClick(event: MouseEvent): void {
      if (ref.current && !ref.current.contains(event.target as Node)) onClose();
    }

    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open, onClose, ref]);
}

function useExportSession(session: AgentSession, closeMenu: () => void): (format: 'json' | 'markdown') => Promise<void> {
  const { toast } = useToastContext();

  return useCallback(async (format: 'json' | 'markdown') => {
    closeMenu();
    if (!window.electronAPI?.sessions?.export) {
      toast('Export not available', 'error');
      return;
    }

    try {
      const result = await window.electronAPI.sessions.export(session, format);
      if (!result.success) toast(`Export failed: ${result.error ?? 'unknown error'}`, 'error');
      else if (!result.cancelled) toast(`Session exported as ${format === 'json' ? 'JSON' : 'Markdown'}`, 'success');
    } catch {
      toast('Export failed', 'error');
    }
  }, [closeMenu, session, toast]);
}

function ExportMenu({
  onExport,
}: {
  onExport: (format: 'json' | 'markdown') => Promise<void>;
}): React.ReactElement {
  return (
    <div className="absolute right-0 z-50 rounded shadow-lg py-0.5 bg-surface-panel border border-border-semantic" style={{ top: '100%', marginTop: '2px', minWidth: '130px' }}>
      <button className="w-full text-left px-3 py-1.5 text-[11px] transition-colors text-text-semantic-primary" onMouseEnter={(event) => { event.currentTarget.style.background = 'var(--bg-tertiary)'; }} onMouseLeave={(event) => { event.currentTarget.style.background = 'transparent'; }} onClick={() => void onExport('json')}>
        Export as JSON
      </button>
      <button className="w-full text-left px-3 py-1.5 text-[11px] transition-colors text-text-semantic-primary" onMouseEnter={(event) => { event.currentTarget.style.background = 'var(--bg-tertiary)'; }} onMouseLeave={(event) => { event.currentTarget.style.background = 'transparent'; }} onClick={() => void onExport('markdown')}>
        Export as Markdown
      </button>
    </div>
  );
}

export const ExportButton = memo(function ExportButton({ session }: ExportButtonProps): React.ReactElement {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const closeMenu = useCallback(() => setOpen(false), []);
  const handleExport = useExportSession(session, closeMenu);

  useOutsideClick(menuRef, open, closeMenu);

  return (
    <div className="relative shrink-0" ref={menuRef}>
      <ActionIconButton title="Export session" ariaLabel="Export session" color="var(--text-faint)" hoverColor="var(--text)" onClick={(event) => { event.stopPropagation(); setOpen((value) => !value); }}>
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
          <path d="M5 1v5M2.5 4L5 6.5 7.5 4M1.5 8.5h7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </ActionIconButton>
      {open && <ExportMenu onExport={handleExport} />}
    </div>
  );
});
