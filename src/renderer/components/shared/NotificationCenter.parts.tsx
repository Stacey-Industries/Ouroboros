import React, { useState } from 'react';

import type { NotificationEntry, NotificationProgress, ToastType } from '../../hooks/useToast';
import {
  getTypeColor,
  notificationBodyStyle,
  notificationIconWrapStyle,
  rowActionStyle,
} from './NotificationCenter.styles';

function NcIconSuccess({ color, size }: { color: string; size: number }): React.ReactElement {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="7" stroke={color} strokeWidth="1.5" />
      <path
        d="M5 8l2 2 4-4"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function NcIconError({ color, size }: { color: string; size: number }): React.ReactElement {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="7" stroke={color} strokeWidth="1.5" />
      <path d="M6 6l4 4M10 6l-4 4" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function NcIconWarning({ color, size }: { color: string; size: number }): React.ReactElement {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M8 1.5l6.93 12H1.07L8 1.5z"
        stroke={color}
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M8 6.5v3" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="8" cy="11.5" r="0.75" fill={color} />
    </svg>
  );
}

function NcIconInfo({ color, size }: { color: string; size: number }): React.ReactElement {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="7" stroke={color} strokeWidth="1.5" />
      <path d="M8 7v4" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="8" cy="4.75" r="0.75" fill={color} />
    </svg>
  );
}

export function NotificationIcon({ type }: { type: ToastType }): React.ReactElement {
  const color = getTypeColor(type);
  const size = 14;
  if (type === 'success') return <NcIconSuccess color={color} size={size} />;
  if (type === 'error') return <NcIconError color={color} size={size} />;
  if (type === 'warning') return <NcIconWarning color={color} size={size} />;
  return <NcIconInfo color={color} size={size} />;
}

function ProgressBarTrack({ percent }: { percent: number }): React.ReactElement {
  return (
    <div
      className="bg-border-semantic"
      style={{ width: '100%', height: '3px', borderRadius: '1.5px', overflow: 'hidden' }}
    >
      <div
        className="bg-interactive-accent"
        style={{
          width: `${percent}%`,
          height: '100%',
          borderRadius: '1.5px',
          transition: 'width 300ms ease',
        }}
      />
    </div>
  );
}

function ProgressBarLabel({ progress }: { progress: NotificationProgress }): React.ReactElement {
  return (
    <div
      className="text-text-semantic-faint"
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        marginTop: '3px',
        fontSize: '10px',
      }}
    >
      {progress.currentItem && (
        <span
          style={{
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            maxWidth: '180px',
            fontFamily: 'var(--font-mono)',
          }}
        >
          {progress.currentItem}
        </span>
      )}
      <span style={{ flexShrink: 0, marginLeft: 'auto' }}>
        {progress.completed}/{progress.total}
      </span>
    </div>
  );
}

export function ProgressBar({
  progress,
}: {
  progress: NotificationProgress;
}): React.ReactElement | null {
  if (progress.status !== 'active' || progress.total <= 0) return null;
  const percent = Math.min(100, Math.round((progress.completed / progress.total) * 100));
  return (
    <div style={{ marginTop: '6px' }}>
      <ProgressBarTrack percent={percent} />
      <ProgressBarLabel progress={progress} />
    </div>
  );
}

export function ProgressStatusIcon({
  progress,
}: {
  progress: NotificationProgress;
}): React.ReactElement {
  if (progress.status === 'active') {
    return (
      <svg
        width={14}
        height={14}
        viewBox="0 0 16 16"
        fill="none"
        aria-hidden="true"
        style={{ animation: 'nc-progress-pulse 1.5s ease-in-out infinite' }}
      >
        <circle
          cx="8"
          cy="8"
          r="6.5"
          stroke="var(--interactive-accent)"
          strokeWidth="1.5"
          strokeDasharray="20 20"
          strokeLinecap="round"
        />
      </svg>
    );
  }
  return <NotificationIcon type={progress.status === 'error' ? 'error' : 'success'} />;
}

const CLOSE_BTN_BASE: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '18px',
  height: '18px',
  padding: 0,
  border: 'none',
  borderRadius: '3px',
  cursor: 'pointer',
  flexShrink: 0,
};

export function NotificationRowClose({
  id,
  onRemove,
}: {
  id: string;
  onRemove: (id: string) => void;
}): React.ReactElement {
  const [closeHovered, setCloseHovered] = useState(false);
  return (
    <button
      type="button"
      aria-label="Remove notification"
      onClick={() => onRemove(id)}
      onMouseEnter={() => setCloseHovered(true)}
      onMouseLeave={() => setCloseHovered(false)}
      style={{
        ...CLOSE_BTN_BASE,
        background: closeHovered ? 'rgba(128,128,128,0.2)' : 'transparent',
      }}
      className="text-text-semantic-muted"
    >
      <svg width="10" height="10" viewBox="0 0 12 12" fill="none" aria-hidden="true">
        <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    </button>
  );
}

export function NotificationRowIcon({ entry }: { entry: NotificationEntry }): React.ReactElement {
  return (
    <div style={notificationIconWrapStyle}>
      {entry.progress ? (
        <ProgressStatusIcon progress={entry.progress} />
      ) : (
        <NotificationIcon type={entry.type} />
      )}
    </div>
  );
}

export function NotificationRowBody({ entry }: { entry: NotificationEntry }): React.ReactElement {
  return (
    <div style={notificationBodyStyle}>
      <div style={{ wordBreak: 'break-word' }}>
        {entry.message}
        {entry.progress?.status === 'active' && (
          <span
            className="text-interactive-accent"
            style={{ marginLeft: '6px', fontSize: '10px', fontWeight: 500 }}
          >
            Running
          </span>
        )}
      </div>
      {entry.progress?.summary && (
        <div className="text-text-semantic-muted" style={{ fontSize: '11px', marginTop: '2px' }}>
          {entry.progress.summary}
        </div>
      )}
      {entry.progress && <ProgressBar progress={entry.progress} />}
      {entry.action && (
        <button
          type="button"
          onClick={entry.action.onClick}
          style={{ ...rowActionStyle, color: getTypeColor(entry.type) }}
        >
          {entry.action.label}
        </button>
      )}
    </div>
  );
}
