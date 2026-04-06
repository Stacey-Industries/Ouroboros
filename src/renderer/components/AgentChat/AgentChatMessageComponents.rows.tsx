import React from 'react';

import type { AgentChatMessageRecord, AgentChatOrchestrationLink } from '../../types/electron';

export function ContextSummaryRow({
  message,
}: {
  message: AgentChatMessageRecord;
}): React.ReactElement | null {
  if (!message.contextSummary) return null;
  const { omittedFileCount, selectedFileCount, usedAdvancedControls } = message.contextSummary;
  const parts = [
    `${selectedFileCount} file${selectedFileCount === 1 ? '' : 's'}`,
    omittedFileCount > 0 ? `${omittedFileCount} excluded` : null,
    usedAdvancedControls ? 'advanced' : null,
  ].filter(Boolean);
  return <div className="mt-1 text-[11px] text-text-semantic-muted">{parts.join(' · ')}</div>;
}

export function VerificationSummaryRow({
  message,
}: {
  message: AgentChatMessageRecord;
}): React.ReactElement | null {
  if (!message.verificationPreview) return null;
  const { profile, status, summary } = message.verificationPreview;
  return (
    <div className="mt-1 text-[11px] text-text-semantic-muted">
      {[profile, status, summary || null].filter(Boolean).join(' · ')}
    </div>
  );
}

export function ErrorInline({
  message,
}: {
  message: AgentChatMessageRecord;
}): React.ReactElement | null {
  return message.error ? (
    <div className="mt-1 text-[11px] text-status-error">{message.error.message}</div>
  ) : null;
}

export function ToolsSummaryRow({
  message,
}: {
  message: AgentChatMessageRecord;
}): React.ReactElement | null {
  return message.toolsSummary ? (
    <div className="mt-1 text-[11px] text-text-semantic-muted">{message.toolsSummary}</div>
  ) : null;
}

export function CostDurationRow({
  message,
}: {
  message: AgentChatMessageRecord;
}): React.ReactElement | null {
  const parts = [message.costSummary, message.durationSummary].filter(Boolean);
  return parts.length ? (
    <div className="mt-0.5 text-[11px] text-text-semantic-muted">{parts.join(' · ')}</div>
  ) : null;
}

export function MessageActionLink({
  message,
  onOpenLinkedDetails,
}: {
  message: AgentChatMessageRecord;
  onOpenLinkedDetails: (link?: AgentChatOrchestrationLink) => Promise<void>;
}): React.ReactElement | null {
  return message.orchestration ? (
    <button
      onClick={() => void onOpenLinkedDetails(message.orchestration)}
      className="mt-1 text-[11px] text-interactive-accent transition-opacity duration-100 hover:opacity-80"
    >
      View details
    </button>
  ) : null;
}
