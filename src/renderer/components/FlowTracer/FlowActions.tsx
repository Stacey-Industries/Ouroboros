/**
 * FlowActions.tsx — Save and Mermaid-export controls for the active FlowTrace.
 *
 * Wave 85 orchestrator-applied integration of Phase 7's `useFlowPersistence`.
 */

import React, { useCallback, useState } from 'react';

import type { FlowTrace } from '../../../shared/types/flowTracer';
import { useFlowPersistence } from './useFlowPersistence';

export function FlowActions({ flow }: { flow: FlowTrace }): React.ReactElement {
  const persistence = useFlowPersistence();
  const [title, setTitle] = useState('');
  const [copied, setCopied] = useState(false);

  const onSave = useCallback((): void => {
    if (!title) return;
    void persistence.saveCurrentFlow(flow, title);
  }, [flow, persistence, title]);

  const onExport = useCallback(async (): Promise<void> => {
    const ok = await persistence.exportMermaidToClipboard(flow);
    if (!ok) return;
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [persistence, flow]);

  return (
    <ActionRow
      title={title}
      onTitleChange={setTitle}
      onSave={onSave}
      onExport={onExport}
      copied={copied}
      status={persistence.status}
    />
  );
}

interface ActionRowProps {
  title: string;
  onTitleChange: (v: string) => void;
  onSave: () => void;
  onExport: () => void;
  copied: boolean;
  status: ReturnType<typeof useFlowPersistence>['status'];
}

function ActionRow({
  title,
  onTitleChange,
  onSave,
  onExport,
  copied,
  status,
}: ActionRowProps): React.ReactElement {
  const saveDisabled = !title || status.kind === 'saving';
  return (
    <div className="flex items-center gap-2 text-xs">
      <input
        type="text"
        value={title}
        onChange={(e) => onTitleChange(e.target.value)}
        placeholder="Save as…"
        className="bg-surface-inset border-border-subtle text-text-semantic-primary rounded border px-2 py-1"
        aria-label="Saved flow title"
      />
      <button
        type="button"
        onClick={onSave}
        disabled={saveDisabled}
        className="bg-interactive-accent text-text-semantic-on-accent rounded px-2 py-1 disabled:opacity-50"
      >
        Save
      </button>
      <button
        type="button"
        onClick={onExport}
        className="bg-surface-raised text-text-semantic-primary border-border-subtle rounded border px-2 py-1"
      >
        {copied ? 'Copied!' : 'Copy Mermaid'}
      </button>
      <ActionStatus status={status} />
    </div>
  );
}

function ActionStatus({
  status,
}: {
  status: ReturnType<typeof useFlowPersistence>['status'];
}): React.ReactElement | null {
  if (status.kind === 'saved') return <span className="text-status-success">Saved</span>;
  if (status.kind === 'error') return <span className="text-status-error">{status.message}</span>;
  return null;
}
