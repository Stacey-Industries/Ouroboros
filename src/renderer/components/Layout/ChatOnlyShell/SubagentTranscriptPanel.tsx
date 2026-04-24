import React, { useEffect, useMemo, useState } from 'react';

import { useAgentEventsContext } from '../../../contexts/AgentEventsContext';
import { SubagentPanel } from '../../AgentMonitor/SubagentPanel';
import {
  consumeLastOpenedSubagentDetail,
  OPEN_SUBAGENT_EVENT,
  type OpenSubagentPanelDetail,
  resolveByToolCallId,
} from '../../AgentMonitor/SubagentPanelHost';

function EmptyState(): React.ReactElement {
  return (
    <div
      className="flex flex-1 items-center justify-center px-6 text-center text-sm text-text-semantic-secondary"
      data-testid="workbench-subagent-panel"
    >
      Select a Task handoff to inspect a subagent transcript.
    </div>
  );
}

function UnresolvedState({
  toolCallId,
  onReset,
}: {
  toolCallId: string;
  onReset: () => void;
}): React.ReactElement {
  return (
    <div
      className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center"
      data-testid="workbench-subagent-panel"
    >
      <div className="text-sm font-semibold text-text-semantic-primary">
        Subagent transcript unavailable
      </div>
      <div className="text-xs text-text-semantic-secondary">
        The selected Task handoff could not be resolved to a tracked child session.
      </div>
      <div className="font-mono text-[11px] text-text-semantic-tertiary">{toolCallId}</div>
      <button
        type="button"
        className="rounded-full border border-stroke-default bg-surface-panel px-3 py-1 text-xs font-semibold text-text-semantic-secondary hover:bg-surface-hover hover:text-text-semantic-primary"
        onClick={onReset}
      >
        Clear selection
      </button>
    </div>
  );
}

function ResolvedPanel({ detail, resolved }: { detail: OpenSubagentPanelDetail; resolved: { subagentId: string; parentSessionId: string } }): React.ReactElement {
  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="workbench-subagent-panel">
      <div className="border-b border-stroke-default px-3 py-2 text-[11px] text-text-semantic-tertiary">
        Resolved from Task handoff {detail.toolCallId}
      </div>
      <div className="min-h-0 flex-1">
        <SubagentPanel subagentId={resolved.subagentId} parentSessionId={resolved.parentSessionId} showCancel={false} />
      </div>
    </div>
  );
}

export function SubagentTranscriptPanel(): React.ReactElement {
  const { currentSessions } = useAgentEventsContext();
  const [detail, setDetail] = useState<OpenSubagentPanelDetail | null>(() => consumeLastOpenedSubagentDetail());

  useEffect(() => {
    function onEvent(event: Event): void {
      const nextDetail = (event as CustomEvent<OpenSubagentPanelDetail>).detail;
      if (!nextDetail?.toolCallId) return;
      setDetail(nextDetail);
    }
    window.addEventListener(OPEN_SUBAGENT_EVENT, onEvent);
    return () => window.removeEventListener(OPEN_SUBAGENT_EVENT, onEvent);
  }, []);

  const resolved = useMemo(() => (detail ? resolveByToolCallId(detail, currentSessions) : null), [currentSessions, detail]);

  if (!detail) return <EmptyState />;
  if (!resolved) return <UnresolvedState toolCallId={detail.toolCallId} onReset={() => { setDetail(null); }} />;
  return <ResolvedPanel detail={detail} resolved={resolved} />;
}
