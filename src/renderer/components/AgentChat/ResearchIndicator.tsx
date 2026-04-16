/**
 * ResearchIndicator.tsx — Ambient pulsing indicator shown in the composer
 * while a /research command is in flight (Wave 25 Phase C).
 */

import React from 'react';

export interface ResearchIndicatorProps {
  topic: string;
}

export function ResearchIndicator({ topic }: ResearchIndicatorProps): React.ReactElement {
  return (
    <div
      className="flex items-center gap-2 px-3 py-1.5 text-xs text-text-semantic-muted"
      data-testid="research-indicator"
    >
      <span
        className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-interactive-accent"
        aria-hidden="true"
      />
      <span>
        Researching <span className="font-medium text-text-semantic-primary">{topic}</span>
        &hellip;
      </span>
    </div>
  );
}
