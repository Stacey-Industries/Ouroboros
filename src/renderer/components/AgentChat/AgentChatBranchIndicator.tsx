import React from 'react';

import type { AgentChatBranchInfo } from '../../types/electron';

export interface AgentChatBranchIndicatorProps {
  branchInfo: AgentChatBranchInfo;
  onSwitchToParent: (parentThreadId: string) => void;
}

function ForkIcon(): React.ReactElement {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="6" y1="3" x2="6" y2="15" />
      <circle cx="18" cy="6" r="3" />
      <circle cx="6" cy="18" r="3" />
      <path d="M18 9a9 9 0 0 1-9 9" />
    </svg>
  );
}

function truncatePreview(text: string, maxLen = 60): string {
  const singleLine = text.replace(/\n/g, ' ').trim();
  if (singleLine.length <= maxLen) return singleLine;
  return `${singleLine.slice(0, maxLen - 1).trimEnd()}\u2026`;
}

export function AgentChatBranchIndicator({
  branchInfo,
  onSwitchToParent,
}: AgentChatBranchIndicatorProps): React.ReactElement {
  return (
    <div
      className="flex items-center gap-2 rounded-md border px-3 py-1.5 text-[11px] text-text-semantic-muted"
      style={{
        backgroundColor: 'rgba(100, 100, 255, 0.04)',
        borderColor: 'rgba(100, 100, 255, 0.15)',
      }}
    >
      <span className="shrink-0 text-interactive-accent">
        <ForkIcon />
      </span>
      <span>
        Branched from{' '}
        <button
          onClick={() => onSwitchToParent(branchInfo.parentThreadId)}
          className="font-medium underline decoration-dotted transition-opacity hover:opacity-80 text-interactive-accent"
          title={`Switch to "${branchInfo.parentTitle}"`}
        >
          {branchInfo.parentTitle}
        </button>
        {' '}at message {branchInfo.fromMessageIndex}
        {branchInfo.fromMessagePreview && (
          <span className="ml-1 opacity-60">
            &ldquo;{truncatePreview(branchInfo.fromMessagePreview, 40)}&rdquo;
          </span>
        )}
      </span>
    </div>
  );
}
