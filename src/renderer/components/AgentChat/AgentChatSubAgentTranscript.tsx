import type { AgentChatSubAgentTranscriptEntry } from '@shared/types/agentChat';
import React from 'react';

import { MessageMarkdown } from './MessageMarkdown';

function TranscriptLabel({
  entry,
}: {
  entry: AgentChatSubAgentTranscriptEntry;
}): React.ReactElement {
  const kindLabel = entry.kind === 'thinking' ? 'Thinking' : 'Reply';
  return (
    <div className="text-[10px] uppercase tracking-wide text-text-semantic-faint">
      {entry.label ?? entry.subAgentId}
      {' · '}
      {kindLabel}
    </div>
  );
}

function TranscriptBody({
  entry,
}: {
  entry: AgentChatSubAgentTranscriptEntry;
}): React.ReactElement {
  if (entry.kind === 'thinking') {
    return (
      <pre
        className="whitespace-pre-wrap rounded-md bg-surface-base px-2 py-1.5 text-[11px] text-text-semantic-muted"
        style={{ fontFamily: 'var(--font-mono)' }}
      >
        {entry.content}
      </pre>
    );
  }

  return (
    <div className="rounded-md bg-surface-base px-2 py-1.5 text-[11px]">
      <MessageMarkdown content={entry.content} />
    </div>
  );
}

export const AgentChatSubAgentTranscript = React.memo(function AgentChatSubAgentTranscript({
  entries,
}: {
  entries: AgentChatSubAgentTranscriptEntry[];
}): React.ReactElement | null {
  if (entries.length === 0) return null;

  return (
    <div className="border-t border-border-semantic px-2.5 py-2 space-y-2">
      <div className="text-[10px] font-medium uppercase tracking-wide text-text-semantic-faint">
        Subagent Transcript
      </div>
      {entries.map((entry) => (
        <div key={entry.entryId} className="space-y-1">
          <TranscriptLabel entry={entry} />
          <TranscriptBody entry={entry} />
        </div>
      ))}
    </div>
  );
});
