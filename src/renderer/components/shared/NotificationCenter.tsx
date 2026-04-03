import React, { memo, useEffect, useRef, useState } from 'react';

import type { NotificationEntry } from '../../hooks/useToast';
import {
  NotificationRowBody,
  NotificationRowClose,
  NotificationRowIcon,
} from './NotificationCenter.parts';
import {
  emptyStateStyle,
  headerLabelStyle,
  NC_STYLES,
  panelHeaderStyle,
  panelStyle,
  rowStyle,
  timestampStyle,
} from './NotificationCenter.styles';

function formatRelativeTime(timestamp: number): string {
  const delta = Math.max(0, Date.now() - timestamp);
  const seconds = Math.floor(delta / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function NotificationRow({
  entry,
  onRemove,
}: {
  entry: NotificationEntry;
  onRemove: (id: string) => void;
}): React.ReactElement {
  return (
    <div
      className="text-text-semantic-primary"
      style={{ ...rowStyle, opacity: entry.read ? 0.7 : 1 }}
    >
      <NotificationRowIcon entry={entry} />
      <NotificationRowBody entry={entry} />
      <span className="text-text-semantic-faint" style={timestampStyle}>
        {formatRelativeTime(entry.createdAt)}
      </span>
      <NotificationRowClose id={entry.id} onRemove={onRemove} />
    </div>
  );
}

function EmptyState(): React.ReactElement {
  return (
    <div className="text-text-semantic-muted" style={emptyStateStyle}>
      <svg
        width="24"
        height="24"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
        opacity="0.5"
      >
        <path
          d="M13 5.5a5 5 0 0 0-10 0c0 2.5-1.5 4-1.5 4h13S13 8 13 5.5z"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path d="M6 13.5a2 2 0 0 0 4 0" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span>No notifications</span>
    </div>
  );
}

function PanelHeader({
  count,
  onClearAll,
}: {
  count: number;
  onClearAll: () => void;
}): React.ReactElement {
  const [clearHovered, setClearHovered] = useState(false);
  return (
    <div style={panelHeaderStyle}>
      <span className="text-text-semantic-muted" style={headerLabelStyle}>
        Notifications
      </span>
      {count > 0 && (
        <button
          type="button"
          onClick={onClearAll}
          onMouseEnter={() => setClearHovered(true)}
          onMouseLeave={() => setClearHovered(false)}
          className="text-text-semantic-muted"
          style={{
            padding: '2px 6px',
            border: 'none',
            borderRadius: '3px',
            background: clearHovered ? 'rgba(128,128,128,0.15)' : 'transparent',
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

export interface NotificationCenterProps {
  notifications: NotificationEntry[];
  onRemove: (id: string) => void;
  onClearAll: () => void;
  onClose: () => void;
}

function useNotificationCenterDismiss(
  panelRef: React.RefObject<HTMLDivElement | null>,
  onClose: () => void,
): void {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    const handleClick = (e: MouseEvent): void => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) onClose();
    };
    const timer = setTimeout(() => {
      window.addEventListener('mousedown', handleClick);
    }, 0);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('mousedown', handleClick);
    };
  }, [onClose, panelRef]);
}

export const NotificationCenter = memo(function NotificationCenter({
  notifications,
  onRemove,
  onClearAll,
  onClose,
}: NotificationCenterProps): React.ReactElement {
  const panelRef = useRef<HTMLDivElement>(null);
  useNotificationCenterDismiss(panelRef, onClose);

  return (
    <>
      <style>{NC_STYLES}</style>
      <div
        ref={panelRef}
        role="dialog"
        aria-label="Notification center"
        className="bg-surface-panel border border-border-semantic"
        style={panelStyle}
      >
        <PanelHeader count={notifications.length} onClearAll={onClearAll} />
        <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
          {notifications.length === 0 ? (
            <EmptyState />
          ) : (
            notifications.map((entry) => (
              <NotificationRow key={entry.id} entry={entry} onRemove={onRemove} />
            ))
          )}
        </div>
      </div>
    </>
  );
});

export function BellIcon(): React.ReactElement {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M13 5.5a5 5 0 0 0-10 0c0 2.5-1.5 4-1.5 4h13S13 8 13 5.5z" />
      <path d="M6 13.5a2 2 0 0 0 4 0" />
    </svg>
  );
}

export interface NotificationBadgeProps {
  count: number;
}

export function NotificationBadge({ count }: NotificationBadgeProps): React.ReactElement | null {
  if (count <= 0) return null;
  const display = count > 99 ? '99+' : String(count);
  return (
    <span
      className="bg-interactive-accent text-white"
      style={{
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
        fontSize: '9px',
        fontWeight: 700,
        fontFamily: 'var(--font-ui)',
        lineHeight: 1,
        pointerEvents: 'none',
      }}
    >
      {display}
    </span>
  );
}
