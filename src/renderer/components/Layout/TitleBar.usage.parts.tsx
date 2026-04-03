import React from 'react';

import type { ClaudeUsageWindow, CodexUsageWindow, UsageWindowSnapshot } from '../../types/electron';
import { dropdownStyle, separatorStyle } from './TitleBar.navbar';

const usageDropdownStyle: React.CSSProperties = {
  ...dropdownStyle,
  right: 0,
  left: 'auto',
  width: '280px',
  padding: '10px 0 8px',
};

const sectionHeaderStyle: React.CSSProperties = {
  padding: '0 12px',
  fontSize: '10px',
  fontWeight: 700,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--text-faint, var(--text-semantic-faint))',
};

function formatResetTime(value: string | number | null): string {
  if (!value) return '';
  if (typeof value === 'string') return `resets ${value}`;
  const ms = value > 1e12 ? value : value * 1000;
  const target = new Date(ms);
  const now = new Date();
  return target.toDateString() === now.toDateString()
    ? `resets ${target.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
    : `resets ${target.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`;
}

function progressBarColor(remaining: number): string {
  if (remaining > 50) return 'var(--status-success)';
  if (remaining > 25) return 'var(--status-warning)';
  return 'var(--status-error)';
}

function UsageProgressBar({ remainingPercent }: { remainingPercent: number }): React.ReactElement {
  const clamped = Math.max(0, Math.min(100, remainingPercent));
  return (
    <div
      className="bg-surface-inset"
      style={{ width: '100%', height: '4px', borderRadius: '2px', overflow: 'hidden' }}
    >
      <div
        style={{
          width: `${clamped}%`,
          height: '100%',
          borderRadius: '2px',
          backgroundColor: progressBarColor(clamped),
          transition: 'width 300ms ease',
        }}
      />
    </div>
  );
}

function UsageWindowRow({
  label,
  remainingPercent,
  resetAt,
}: {
  label: string;
  remainingPercent: number;
  resetAt: string | number | null;
}): React.ReactElement {
  const rounded = Math.round(remainingPercent);
  const resetText = formatResetTime(resetAt);
  return (
    <div style={{ padding: '5px 12px 6px' }}>
      <div className="flex items-center justify-between" style={{ marginBottom: '4px' }}>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-text-semantic-faint">
            {label}
          </span>
          <span
            className="text-[12px] font-semibold text-text-semantic-primary"
            style={{ fontFamily: 'var(--font-mono)' }}
          >
            {rounded}% remaining
          </span>
        </div>
        {resetText && (
          <span
            className="text-[9px] text-text-semantic-faint"
            style={{ fontFamily: 'var(--font-mono)' }}
          >
            {resetText}
          </span>
        )}
      </div>
      <UsageProgressBar remainingPercent={remainingPercent} />
    </div>
  );
}

function NoWindowMessage({ label }: { label: string }): React.ReactElement {
  return (
    <div className="px-3 py-1.5 text-[10px] text-text-semantic-faint">
      No recent {label} window data
    </div>
  );
}

function usageWindowToRemaining(win: ClaudeUsageWindow | CodexUsageWindow): {
  remaining: number;
  resetAt: string | number | null;
} {
  return { remaining: 100 - win.usedPercent, resetAt: win.resetsAt };
}

function CodexSection({ snapshot }: { snapshot: UsageWindowSnapshot }): React.ReactElement {
  const codex = snapshot.codex;
  return (
    <>
      <div className="flex items-center justify-between" style={sectionHeaderStyle}>
        <span>Codex</span>
        {codex?.planType && (
          <span
            className="text-[9px] normal-case tracking-normal text-text-semantic-faint"
            style={{ fontFamily: 'var(--font-mono)' }}
          >
            {codex.planType}
          </span>
        )}
      </div>
      {codex?.fiveHour ? (
        <UsageWindowRow
          label="5h"
          remainingPercent={usageWindowToRemaining(codex.fiveHour).remaining}
          resetAt={usageWindowToRemaining(codex.fiveHour).resetAt}
        />
      ) : (
        <NoWindowMessage label="5h" />
      )}
      {codex?.weekly ? (
        <UsageWindowRow
          label="Week"
          remainingPercent={usageWindowToRemaining(codex.weekly).remaining}
          resetAt={usageWindowToRemaining(codex.weekly).resetAt}
        />
      ) : (
        <NoWindowMessage label="weekly" />
      )}
    </>
  );
}

function ClaudeSection({ snapshot }: { snapshot: UsageWindowSnapshot }): React.ReactElement {
  const claude = snapshot.claude;
  return (
    <>
      <div style={sectionHeaderStyle}>Claude Code</div>
      {claude ? (
        <>
          {claude.fiveHour ? (
            <UsageWindowRow
              label="5h"
              remainingPercent={usageWindowToRemaining(claude.fiveHour).remaining}
              resetAt={usageWindowToRemaining(claude.fiveHour).resetAt}
            />
          ) : (
            <NoWindowMessage label="5h" />
          )}
          {claude.weekly ? (
            <UsageWindowRow
              label="Week"
              remainingPercent={usageWindowToRemaining(claude.weekly).remaining}
              resetAt={usageWindowToRemaining(claude.weekly).resetAt}
            />
          ) : (
            <NoWindowMessage label="weekly" />
          )}
        </>
      ) : (
        <div className="px-3 py-1.5 text-[10px] text-text-semantic-faint">
          Waiting for Claude Code session data...
        </div>
      )}
    </>
  );
}

function DropdownHeader({ fetchedAt }: { fetchedAt: number | null }): React.ReactElement {
  return (
    <div className="flex items-center justify-between px-3 pb-2">
      <div>
        <div className="text-[11px] font-semibold text-text-semantic-primary">
          Usage Windows
        </div>
        <div className="text-[9px] text-text-semantic-faint">
          Rolling rate limit remaining
        </div>
      </div>
      {fetchedAt !== null && (
        <span
          className="text-[9px] text-text-semantic-faint"
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          {new Date(fetchedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
        </span>
      )}
    </div>
  );
}

function LoadingOrError({
  isLoading,
  error,
}: {
  isLoading: boolean;
  error: string | null;
}): React.ReactElement {
  if (isLoading) {
    return (
      <div className="px-3 py-4 text-[11px] italic text-text-semantic-faint">
        Loading usage windows...
      </div>
    );
  }
  return <div className="px-3 py-4 text-[11px] text-status-error">{error}</div>;
}

export function UsageDropdown({
  snapshot,
  isLoading,
  error,
}: {
  snapshot: UsageWindowSnapshot | null;
  isLoading: boolean;
  error: string | null;
}): React.ReactElement {
  return (
    <div
      className="titlebar-no-drag bg-surface-panel border border-border-semantic"
      style={usageDropdownStyle}
    >
      <DropdownHeader fetchedAt={snapshot?.fetchedAt ?? null} />
      {snapshot ? (
        <>
          <ClaudeSection snapshot={snapshot} />
          <div style={separatorStyle} />
          <CodexSection snapshot={snapshot} />
          <div className="px-3 pt-2 text-[9px] text-text-semantic-faint">
            Auto-refreshes every 10s
          </div>
        </>
      ) : (
        <LoadingOrError isLoading={isLoading} error={error} />
      )}
    </div>
  );
}
