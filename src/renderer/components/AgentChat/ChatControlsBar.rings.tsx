/**
 * ChatControlsBar.rings.tsx — SVG context-window ring components.
 * Extracted from ChatControlsBar.tsx to keep that file under the 300-line limit.
 */

import React from 'react';

import type { CodexModelOption } from '../../types/electron';
import { getContextLimit, getContextTone, type ModelUsageEntry } from './ChatControlsBarSupport';

type ContextRingProps = {
  pct: number;
  tone: string;
  label: string;
  size?: number;
  stroke?: number;
  isStreaming?: boolean;
};

type ArcProps = {
  cx: number;
  cy: number;
  r: number;
  stroke: number;
  tone: string;
  circumference: number;
  offset: number;
};

function ContextRingArcs(p: ArcProps): React.ReactElement {
  return (
    <g style={{ transform: 'rotate(-90deg)', transformOrigin: 'center' }}>
      <circle
        cx={p.cx}
        cy={p.cy}
        r={p.r}
        fill="none"
        stroke="var(--border-default)"
        strokeWidth={p.stroke}
      />
      <circle
        cx={p.cx}
        cy={p.cy}
        r={p.r}
        fill="none"
        stroke={p.tone}
        strokeWidth={p.stroke}
        strokeDasharray={p.circumference}
        strokeDashoffset={p.offset}
        strokeLinecap="round"
        style={{ transition: 'stroke-dashoffset 0.3s ease' }}
      />
    </g>
  );
}

function ContextRing(props: ContextRingProps): React.ReactElement {
  const size = props.size ?? 26;
  const stroke = props.stroke ?? 2.5;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (props.pct / 100) * circumference;
  const cx = size / 2;
  const cy = size / 2;
  const pulseStyle: React.CSSProperties = props.isStreaming
    ? { animation: 'contextRingPulse 1.5s ease-in-out infinite' }
    : {};
  return (
    <svg width={size} height={size} style={{ pointerEvents: 'none', ...pulseStyle }}>
      <ContextRingArcs
        cx={cx}
        cy={cy}
        r={radius}
        stroke={stroke}
        tone={props.tone}
        circumference={circumference}
        offset={offset}
      />
      <text
        x={cx}
        y={cy}
        textAnchor="middle"
        dominantBaseline="central"
        fill="var(--text-primary)"
        style={{ fontSize: '8px', fontFamily: 'var(--font-mono)' }}
      >
        {props.label}
      </text>
    </svg>
  );
}

export function ModelContextUsageIndicator(props: {
  usage: ModelUsageEntry[];
  codexModels?: CodexModelOption[];
  isStreaming?: boolean;
}): React.ReactElement | null {
  if (props.usage.length === 0) return null;
  return (
    <div className="flex items-center gap-2">
      {props.usage.map((entry) => {
        const limit = getContextLimit(entry.model, props.codexModels);
        const pct = Math.min(100, Math.round((entry.inputTokens / limit) * 100));
        return (
          <div
            key={entry.model}
            title={`${entry.inputTokens.toLocaleString()} / ${limit.toLocaleString()} Tokens`}
            style={{ cursor: 'default' }}
          >
            <ContextRing
              pct={pct}
              tone={getContextTone(pct)}
              label={String(pct)}
              isStreaming={props.isStreaming}
            />
          </div>
        );
      })}
    </div>
  );
}
