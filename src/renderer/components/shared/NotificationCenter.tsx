/**
 * NotificationCenter.tsx — Dropdown panel listing persistent notification history.
 *
 * Rendered from TitleBar, toggled by the bell icon. Shows the last 50
 * notifications with relative timestamps, color-coded icons, and optional
 * action buttons. Dismissible by clicking outside or pressing Escape.
 */

import React, { memo, useEffect, useRef, useState } from 'react';

import type { NotificationEntry, NotificationProgress, ToastType } from '../../hooks/useToast';

// ── Relative time formatting ────────────────────────────────────────────────

function formatRelativeTime(timestamp: number): string {
  const delta = Math.max(0, Date.now() - timestamp);
  const seconds = Math.floor(delta / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// ── Color mapping ───────────────────────────────────────────────────────────

function getTypeColor(type: ToastType): string {
  switch (type) {
    case 'success': return 'var(--success, #3fb950)';
    case 'error':   return 'var(--error, #f85149)';
    case 'warning': return 'var(--warning, #d29922)';
    case 'info':
    default:        return 'var(--accent, #58a6ff)';
  }
}

// ── Notification type icon (small, 14px) ────────────────────────────────────

function NotificationIcon({ type }: { type: ToastType }): React.ReactElement {
  const color = getTypeColor(type);
  const s = 14;

  switch (type) {
    case 'success':
      return (
        <svg width={s} height={s} viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <circle cx="8" cy="8" r="7" stroke={color} strokeWidth="1.5" />
          <path d="M5 8l2 2 4-4" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'error':
      return (
        <svg width={s} height={s} viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <circle cx="8" cy="8" r="7" stroke={color} strokeWidth="1.5" />
          <path d="M6 6l4 4M10 6l-4 4" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      );
    case 'warning':
      return (
        <svg width={s} height={s} viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M8 1.5l6.93 12H1.07L8 1.5z" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
          <path d="M8 6.5v3" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
          <circle cx="8" cy="11.5" r="0.75" fill={color} />
        </svg>
      );
    case 'info':
    default:
      return (
        <svg width={s} height={s} viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <circle cx="8" cy="8" r="7" stroke={color} strokeWidth="1.5" />
          <path d="M8 7v4" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
          <circle cx="8" cy="4.75" r="0.75" fill={color} />
        </svg>
      );
  }
}

// ── CSS keyframes (injected once) ───────────────────────────────────────────

const NC_STYLES = `
@keyframes nc-fade-in {
  from { opacity: 0; transform: translateY(-4px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes nc-progress-pulse {
  0%, 100% { opacity: 0.7; }
  50% { opacity: 1; }
}
`;

// ── Progress bar component ──────────────────────────────────────────────────

function ProgressBar({ progress }: { progress: NotificationProgress }): React.ReactElement | null {
  if (progress.status !== 'active' || progress.total <= 0) return null;

  const percent = Math.min(100, Math.round((progress.completed / progress.total) * 100));

  return (
    <div style={{ marginTop: '6px' }}>
      <div style={{
        width: '100%',
        height: '3px',
        borderRadius: '1.5px',
        backgroundColor: 'var(--border)',
        overflow: 'hidden',
      }}>
        <div style={{
          width: `${percent}%`,
          height: '100%',
          borderRadius: '1.5px',
          backgroundColor: 'var(--accent)',
          transition: 'width 300ms ease',
        }} />
      </div>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        marginTop: '3px',
        fontSize: '10px',
        color: 'var(--text-faint, var(--text-muted))',
      }}>
        {progress.currentItem && (
          <span style={{
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            maxWidth: '180px',
            fontFamily: 'var(--font-mono)',
          }}>
            {progress.currentItem}
          </span>
        )}
        <span style={{ flexShrink: 0, marginLeft: 'auto' }}>
          {progress.completed}/{progress.total}
        </span>
      </div>
    </div>
  );
}

// ── Progress status icon ────────────────────────────────────────────────────

function ProgressStatusIcon({ progress }: { progress: NotificationProgress }): React.ReactElement {
  if (progress.status === 'active') {
    // Animated spinner
    return (
      <svg width={14} height={14} viewBox="0 0 16 16" fill="none" aria-hidden="true"
        style={{ animation: 'nc-progress-pulse 1.5s ease-in-out infinite' }}>
        <circle cx="8" cy="8" r="6.5" stroke="var(--accent, #58a6ff)" strokeWidth="1.5" strokeDasharray="20 20" strokeLinecap="round" />
      </svg>
    );
  }
  // Completed or error — use regular icon
  const type = progress.status === 'error' ? 'error' : 'success';
  return <NotificationIcon type={type} />;
}

// ── Individual notification row ─────────────────────────────────────────────

interface NotificationRowProps {
  entry: NotificationEntry;
  onRemove: (id: string) => void;
}

const rowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: '8px',
  padding: '8px 12px',
  borderBottom: '1px solid color-mix(in srgb, var(--border) 40%, transparent)',
  fontSize: '12px',
  lineHeight: '1.4',
  color: 'var(--text)',
  fontFamily: 'var(--font-ui)',
};

const timestampStyle: React.CSSProperties = {
  fontSize: '10px',
  color: 'var(--text-faint, var(--text-muted))',
  whiteSpace: 'nowrap',
  flexShrink: 0,
  marginTop: '1px',
};

const actionBtnStyle: React.CSSProperties = {
  display: 'inline-block',
  padding: '1px 4px',
  marginTop: '2px',
  border: 'none',
  borderRadius: '3px',
  background: 'transparent',
  cursor: 'pointer',
  fontFamily: 'inherit',
  fontSize: '11px',
  fontWeight: 600,
  textDecoration: 'underline',
  textUnderlineOffset: '2px',
};

function NotificationRow({ entry, onRemove }: NotificationRowProps): React.ReactElement {
  const [closeHovered, setCloseHovered] = useState(false);

  return (
    <div style={{
      ...rowStyle,
      opacity: entry.read ? 0.7 : 1,
    }}>
      <div style={{ flexShrink: 0, marginTop: '2px' }}>
        {entry.progress ? <ProgressStatusIcon progress={entry.progress} /> : <NotificationIcon type={entry.type} />}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ wordBreak: 'break-word' }}>
          {entry.message}
          {entry.progress?.status === 'active' && (
            <span style={{ marginLeft: '6px', fontSize: '10px', color: 'var(--accent)', fontWeight: 500 }}>
              Running
            </span>
          )}
        </div>
        {entry.progress?.summary && (
          <div style={{
            fontSize: '11px',
            color: 'var(--text-muted)',
            marginTop: '2px',
          }}>
            {entry.progress.summary}
          </div>
        )}
        {entry.progress && <ProgressBar progress={entry.progress} />}
        {entry.action && (
          <button
            type="button"
            onClick={entry.action.onClick}
            style={{ ...actionBtnStyle, color: getTypeColor(entry.type) }}
          >
            {entry.action.label}
          </button>
        )}
      </div>

      <span style={timestampStyle}>{formatRelativeTime(entry.createdAt)}</span>

      <button
        type="button"
        aria-label="Remove notification"
        onClick={() => onRemove(entry.id)}
        onMouseEnter={() => setCloseHovered(true)}
        onMouseLeave={() => setCloseHovered(false)}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '18px',
          height: '18px',
          padding: 0,
          border: 'none',
          borderRadius: '3px',
          background: closeHovered ? 'rgba(128,128,128,0.2)' : 'transparent',
          color: 'var(--text-muted)',
          cursor: 'pointer',
          flexShrink: 0,
        }}
      >
        <svg width="10" height="10" viewBox="0 0 12 12" fill="none" aria-hidden="true">
          <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}

// ── Empty state ─────────────────────────────────────────────────────────────

function EmptyState(): React.ReactElement {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '32px 16px',
      color: 'var(--text-muted)',
      fontSize: '12px',
      fontFamily: 'var(--font-ui)',
      gap: '8px',
    }}>
      <svg width="24" height="24" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" opacity="0.5">
        <path d="M13 5.5a5 5 0 0 0-10 0c0 2.5-1.5 4-1.5 4h13S13 8 13 5.5z" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M6 13.5a2 2 0 0 0 4 0" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span>No notifications</span>
    </div>
  );
}

// ── Panel header ────────────────────────────────────────────────────────────

interface PanelHeaderProps {
  count: number;
  onClearAll: () => void;
}

function PanelHeader({ count, onClearAll }: PanelHeaderProps): React.ReactElement {
  const [clearHovered, setClearHovered] = useState(false);

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '8px 12px',
      borderBottom: '1px solid var(--border)',
      fontFamily: 'var(--font-ui)',
    }}>
      <span style={{
        fontSize: '11px',
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '0.04em',
        color: 'var(--text-muted)',
      }}>
        Notifications
      </span>
      {count > 0 && (
        <button
          type="button"
          onClick={onClearAll}
          onMouseEnter={() => setClearHovered(true)}
          onMouseLeave={() => setClearHovered(false)}
          style={{
            padding: '2px 6px',
            border: 'none',
            borderRadius: '3px',
            background: clearHovered ? 'rgba(128,128,128,0.15)' : 'transparent',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            fontFamily: 'inherit',
            fontSize: '10px',
            fontWeight: 500,
          }}
        >
          Clear All
        </button>
      )}
    </div>
  );
}

// ── Main NotificationCenter panel ───────────────────────────────────────────

export interface NotificationCenterProps {
  notifications: NotificationEntry[];
  onRemove: (id: string) => void;
  onClearAll: () => void;
  onClose: () => void;
}

export const NotificationCenter = memo(function NotificationCenter({
  notifications,
  onRemove,
  onClearAll,
  onClose,
}: NotificationCenterProps): React.ReactElement {
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on Escape
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent): void {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Close on click outside
  useEffect(() => {
    function handleClick(e: MouseEvent): void {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    // Delay to avoid the triggering click from immediately closing
    const timer = setTimeout(() => {
      window.addEventListener('mousedown', handleClick);
    }, 0);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('mousedown', handleClick);
    };
  }, [onClose]);

  return (
    <>
      <style>{NC_STYLES}</style>
      <div
        ref={panelRef}
        role="dialog"
        aria-label="Notification center"
        className="glass-card"
        style={{
          position: 'absolute',
          top: 'calc(var(--titlebar-height, 36px) - 2px)',
          right: '0',
          width: '320px',
          maxHeight: '400px',
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--glass-card-bg, var(--bg-secondary, var(--bg)))',
          border: '1px solid var(--glass-border-muted, var(--border))',
          borderRadius: '8px',
          boxShadow: 'var(--glass-shadow, 0 8px 24px rgba(0, 0, 0, 0.35))',
          zIndex: 9999,
          overflow: 'hidden',
          animation: 'nc-fade-in 150ms ease-out',
        }}
      >
        <PanelHeader count={notifications.length} onClearAll={onClearAll} />
        <div style={{
          flex: 1,
          overflowY: 'auto',
          overflowX: 'hidden',
        }}>
          {notifications.length === 0
            ? <EmptyState />
            : notifications.map((entry) => (
                <NotificationRow key={entry.id} entry={entry} onRemove={onRemove} />
              ))
          }
        </div>
      </div>
    </>
  );
});

// ── Bell icon for TitleBar ──────────────────────────────────────────────────

export function BellIcon(): React.ReactElement {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
      <path d="M13 5.5a5 5 0 0 0-10 0c0 2.5-1.5 4-1.5 4h13S13 8 13 5.5z" />
      <path d="M6 13.5a2 2 0 0 0 4 0" />
    </svg>
  );
}

// ── Badge overlay ───────────────────────────────────────────────────────────

export interface NotificationBadgeProps {
  count: number;
}

export function NotificationBadge({ count }: NotificationBadgeProps): React.ReactElement | null {
  if (count <= 0) return null;

  const display = count > 99 ? '99+' : String(count);

  return (
    <span style={{
      position: 'absolute',
      top: '2px',
      right: '2px',
      minWidth: '14px',
      height: '14px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '0 3px',
      borderRadius: '7px',
      backgroundColor: 'var(--accent, #58a6ff)',
      color: '#fff',
      fontSize: '9px',
      fontWeight: 700,
      fontFamily: 'var(--font-ui)',
      lineHeight: 1,
      pointerEvents: 'none',
    }}>
      {display}
    </span>
  );
}
