import type { MouseEventHandler } from 'react';
import React, { memo } from 'react';

import type { UsageSummary } from '../../types/electron';
import { ModelDistribution, SessionList } from './UsageModalSections.parts';
import {
  getSummaryCards,
  type SummaryCardData,
  TIME_RANGE_OPTIONS,
  type TimeRange,
} from './usageModalUtils';

function setHoverColor(color: string): MouseEventHandler<HTMLButtonElement> {
  return (event) => {
    event.currentTarget.style.color = color;
  };
}

export const UsageModalHeader = memo(function UsageModalHeader({
  onClose,
}: {
  onClose: () => void;
}): React.ReactElement<any> {
  return (
    <div className="flex items-center justify-between px-4 py-2.5 flex-shrink-0 border-b border-border-semantic">
      <div className="flex items-center gap-2">
        <UsageIcon />
        <span className="text-[13px] font-semibold text-text-semantic-primary">
          Claude Code Usage
        </span>
        <span className="text-[10px] text-text-semantic-faint">(from ~/.claude local data)</span>
      </div>
      <button
        onClick={onClose}
        className="text-text-semantic-muted"
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: '4px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
        onMouseEnter={setHoverColor('var(--text-primary)')}
        onMouseLeave={setHoverColor('var(--text-muted)')}
      >
        <CloseIcon />
      </button>
    </div>
  );
});

function UsageIcon(): React.ReactElement<any> {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="var(--interactive-accent)"
      strokeWidth="1.3"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="1" y="5" width="3" height="10" rx="0.5" />
      <rect x="6.5" y="1" width="3" height="14" rx="0.5" />
      <rect x="12" y="3" width="3" height="12" rx="0.5" />
    </svg>
  );
}

function CloseIcon(): React.ReactElement<any> {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    >
      <path d="M4 4l8 8M12 4l-8 8" />
    </svg>
  );
}

interface UsageRangeControlsProps {
  range: TimeRange;
  onRangeChange: (range: TimeRange) => void;
  onRefresh: () => void;
}

export const UsageRangeControls = memo(function UsageRangeControls({
  range,
  onRangeChange,
  onRefresh,
}: UsageRangeControlsProps): React.ReactElement<any> {
  return (
    <div className="flex items-center gap-1.5 px-4 py-2 flex-shrink-0 border-b border-border-semantic">
      {TIME_RANGE_OPTIONS.map((option) => (
        <RangeButton
          key={option.key}
          option={option}
          isActive={range === option.key}
          onClick={onRangeChange}
        />
      ))}
      <div className="flex-1" />
      <button
        onClick={onRefresh}
        className="px-2 py-0.5 rounded text-[10px] transition-colors text-text-semantic-faint border border-border-semantic"
        style={{ background: 'transparent', cursor: 'pointer', fontFamily: 'var(--font-ui)' }}
        onMouseEnter={setHoverColor('var(--text-primary)')}
        onMouseLeave={setHoverColor('var(--text-faint)')}
      >
        Refresh
      </button>
    </div>
  );
});

interface RangeButtonProps {
  isActive: boolean;
  onClick: (range: TimeRange) => void;
  option: { key: TimeRange; label: string };
}

const RangeButton = memo(function RangeButton({
  isActive,
  onClick,
  option,
}: RangeButtonProps): React.ReactElement<any> {
  return (
    <button
      onClick={() => onClick(option.key)}
      className="px-2 py-0.5 rounded text-[10px] transition-colors"
      style={{
        background: isActive
          ? 'color-mix(in srgb, var(--interactive-accent) 20%, transparent)'
          : 'transparent',
        color: isActive ? 'var(--interactive-accent)' : 'var(--text-faint)',
        border: isActive ? '1px solid var(--interactive-accent)' : '1px solid transparent',
        cursor: 'pointer',
        fontFamily: 'var(--font-ui)',
      }}
    >
      {option.label}
    </button>
  );
});

interface UsageModalContentProps {
  error: string | null;
  isLoading: boolean;
  onRetry: () => void;
  summary: UsageSummary | null;
}

export const UsageModalContent = memo(function UsageModalContent({
  error,
  isLoading,
  onRetry,
  summary,
}: UsageModalContentProps): React.ReactElement<any> {
  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
      {getUsageContent(summary, isLoading, error, onRetry)}
    </div>
  );
});

function getUsageContent(
  summary: UsageSummary | null,
  isLoading: boolean,
  error: string | null,
  onRetry: () => void,
): React.ReactNode {
  if (isLoading) return <LoadingState />;
  if (error) return <ErrorState error={error} onRetry={onRetry} />;
  if (!summary) return null;
  return (
    <>
      <SummaryCards summary={summary} />
      <ModelDistribution sessions={summary.sessions} />
      <SessionList sessions={summary.sessions} />
    </>
  );
}

function LoadingState(): React.ReactElement<any> {
  return (
    <div className="flex items-center justify-center py-12">
      <span className="text-[11px] italic text-text-semantic-faint">
        Scanning Claude Code session files...
      </span>
    </div>
  );
}

function ErrorState({
  error,
  onRetry,
}: {
  error: string;
  onRetry: () => void;
}): React.ReactElement<any> {
  return (
    <div className="flex flex-col items-center justify-center py-12 gap-2">
      <span className="text-[11px] text-status-error">{error}</span>
      <button
        onClick={onRetry}
        className="text-[10px] px-3 py-1 rounded bg-surface-raised text-text-semantic-muted border border-border-semantic"
        style={{ cursor: 'pointer' }}
      >
        Retry
      </button>
    </div>
  );
}

const SummaryCards = memo(function SummaryCards({
  summary,
}: {
  summary: UsageSummary;
}): React.ReactElement<any> {
  return (
    <div className="grid grid-cols-3 gap-2 px-4 py-3 border-b border-border-semantic">
      {getSummaryCards(summary.totals).map((card) => (
        <SummaryCard key={card.label} card={card} />
      ))}
    </div>
  );
});

function SummaryCard({ card }: { card: SummaryCardData }): React.ReactElement<any> {
  return (
    <div className="flex flex-col items-center rounded-md px-2 py-2 bg-surface-raised">
      <span className="text-[9px] font-medium uppercase tracking-wider text-text-semantic-faint">
        {card.label}
      </span>
      <span
        className="text-[15px] font-bold tabular-nums text-interactive-accent"
        style={{ fontFamily: 'var(--font-mono)' }}
      >
        {card.value}
      </span>
      {card.sub ? <span className="text-[9px] text-text-semantic-faint">{card.sub}</span> : null}
    </div>
  );
}
