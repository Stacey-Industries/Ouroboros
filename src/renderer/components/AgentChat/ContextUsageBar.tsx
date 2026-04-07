/**
 * ContextUsageBar.tsx — Linear context-window usage indicator for the chat composer.
 *
 * Renders a thin progress bar + percentage label showing how much of the model's
 * context window is consumed. Mirrors the ring indicator in ChatControlsBar but
 * as a compact horizontal bar placed above the controls row.
 */

import React from 'react';

import type { CodexModelOption } from '../../types/electron';
import { getContextLimit, getContextTone } from './ChatControlsBarSupport';

interface ContextUsageBarProps {
  inputTokens: number;
  model: string;
  codexModels?: CodexModelOption[];
  isStreaming?: boolean;
}

function buildBarStyle(pct: number, tone: string): React.CSSProperties {
  return {
    width: `${pct}%`,
    backgroundColor: tone,
    transition: 'width 0.4s ease, background-color 0.3s ease',
  };
}

function buildLabelClass(pct: number): string {
  if (pct >= 90) return 'text-status-error';
  if (pct >= 70) return 'text-status-warning';
  return 'text-text-semantic-muted';
}

export function ContextUsageBar(props: ContextUsageBarProps): React.ReactElement | null {
  if (props.inputTokens <= 0) return null;

  const limit = getContextLimit(props.model, props.codexModels);
  const pct = Math.min(100, Math.round((props.inputTokens / limit) * 100));
  const tone = getContextTone(pct);
  const labelClass = buildLabelClass(pct);
  const title = `${props.inputTokens.toLocaleString()} / ${limit.toLocaleString()} input tokens`;

  return (
    <div
      className={`flex items-center gap-2 px-3 py-0.5 ${labelClass}`}
      title={title}
      style={{ fontFamily: 'var(--font-ui)' }}
    >
      <div className="h-0.5 flex-1 overflow-hidden rounded-full bg-surface-inset">
        <div className="h-full rounded-full" style={buildBarStyle(pct, tone)} />
      </div>
      <span className="shrink-0 text-[10px]">{pct}% ctx</span>
    </div>
  );
}
