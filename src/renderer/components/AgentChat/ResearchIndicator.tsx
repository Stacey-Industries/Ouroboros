/**
 * ResearchIndicator.tsx — Ambient indicator shown in the composer while a
 * /research command is in flight (Wave 25 Phase C/E).
 *
 * Phase E adds:
 *   - CSS spinner (border-t-interactive-accent animate-spin) replacing the pulse dot
 *   - Cancel button that fires `agent-ide:cancel-research` DOM event
 */

import React from 'react';

export interface ResearchIndicatorProps {
  topic: string;
  /** Optional — if provided, rendered alongside the cancel button for context. */
  onCancel?: () => void;
}

function cancelResearch(): void {
  window.dispatchEvent(new CustomEvent('agent-ide:cancel-research'));
}

export function ResearchIndicator({ topic, onCancel }: ResearchIndicatorProps): React.ReactElement {
  function handleCancel(): void {
    if (onCancel) onCancel();
    cancelResearch();
  }

  return (
    <div
      className="flex items-center gap-2 px-3 py-1.5 text-xs text-text-semantic-muted"
      data-testid="research-indicator"
    >
      <span
        className="h-3 w-3 shrink-0 animate-spin rounded-full border-2 border-border-semantic border-t-interactive-accent"
        aria-hidden="true"
        data-testid="research-spinner"
      />
      <span className="flex-1">
        Researching <span className="font-medium text-text-semantic-primary">{topic}</span>
        &hellip;
      </span>
      <button
        onClick={handleCancel}
        className="shrink-0 rounded px-1.5 py-0.5 text-xs text-text-semantic-muted hover:text-text-semantic-primary"
        style={{ background: 'none', border: 'none', cursor: 'pointer' }}
        aria-label="Cancel research"
        data-testid="research-cancel-btn"
      >
        Cancel
      </button>
    </div>
  );
}
