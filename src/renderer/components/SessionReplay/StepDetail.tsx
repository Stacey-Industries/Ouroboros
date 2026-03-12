/**
 * StepDetail.tsx — Detailed view of a single replay step.
 *
 * For tool calls: shows tool name, input, output, duration, and status.
 * For session start: shows task label and session metadata.
 * Output is shown in a scrollable monospace block with syntax highlighting hints.
 */

import React, { memo } from 'react';
import type { ReplayStep } from './types';
import type { AgentSession } from '../AgentMonitor/types';
import { formatTokenCount, estimateCost, formatCost } from '../AgentMonitor/costCalculator';

interface StepDetailProps {
  step: ReplayStep;
  session: AgentSession;
  stepNumber: number;
  totalSteps: number;
}

const TOOL_COLOR: Record<string, string> = {
  Read:     'var(--accent)',
  Edit:     'var(--warning)',
  Write:    'var(--warning)',
  Bash:     'var(--success)',
  Grep:     'var(--purple, #a371f7)',
  Glob:     'var(--purple, #a371f7)',
};

function toolColor(name: string): string {
  return TOOL_COLOR[name] ?? 'var(--text-muted)';
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const m = Math.floor(ms / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  return `${m}m ${s}s`;
}

function formatTime(ms: number): string {
  const d = new Date(ms);
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export const StepDetail = memo(function StepDetail({
  step,
  session,
  stepNumber,
  totalSteps,
}: StepDetailProps): React.ReactElement {
  if (step.type === 'session_start') {
    return (
      <div style={{ padding: '12px', fontFamily: 'var(--font-ui)' }}>
        {/* Step counter */}
        <StepCounter step={stepNumber} total={totalSteps} />

        <h3 style={{
          margin: '8px 0 4px',
          fontSize: '0.875rem',
          fontWeight: 600,
          color: 'var(--text)',
        }}>
          Session Started
        </h3>

        <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginBottom: '12px' }}>
          {session.taskLabel}
        </div>

        <MetadataGrid>
          <MetadataRow label="Started" value={formatTime(session.startedAt)} />
          {session.completedAt && (
            <MetadataRow label="Duration" value={formatDuration(session.completedAt - session.startedAt)} />
          )}
          {session.model && <MetadataRow label="Model" value={session.model} />}
          <MetadataRow label="Tool Calls" value={String(session.toolCalls.length)} />
          {(session.inputTokens > 0 || session.outputTokens > 0) && (
            <>
              <MetadataRow label="Input Tokens" value={formatTokenCount(session.inputTokens)} />
              <MetadataRow label="Output Tokens" value={formatTokenCount(session.outputTokens)} />
              <MetadataRow
                label="Estimated Cost"
                value={formatCost(estimateCost(session.model ?? 'claude-sonnet-4-20250514', session.inputTokens, session.outputTokens, session.cacheReadTokens, session.cacheWriteTokens))}
              />
            </>
          )}
          <MetadataRow label="Status" value={session.status} color={
            session.status === 'complete' ? 'var(--success, #4CAF50)' :
            session.status === 'error' ? 'var(--error, #f85149)' :
            'var(--accent)'
          } />
        </MetadataGrid>
      </div>
    );
  }

  // Tool call step
  const tc = step.toolCall!;
  const color = toolColor(tc.toolName);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ flexShrink: 0, padding: '8px 12px' }}>
        <StepCounter step={stepNumber} total={totalSteps} />

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px' }}>
          {/* Tool badge */}
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '2px 8px',
              borderRadius: '4px',
              fontSize: '0.75rem',
              fontWeight: 600,
              fontFamily: 'var(--font-mono)',
              color,
              border: `1px solid ${color}`,
              background: `color-mix(in srgb, ${color} 10%, transparent)`,
            }}
          >
            {tc.toolName}
          </span>

          {/* Status */}
          <span style={{
            fontSize: '0.6875rem',
            fontWeight: 500,
            color: tc.status === 'success' ? 'var(--success, #4CAF50)' :
                   tc.status === 'error' ? 'var(--error, #f85149)' :
                   'var(--accent)',
          }}>
            {tc.status.toUpperCase()}
          </span>

          {/* Duration */}
          {tc.duration !== undefined && (
            <span style={{ fontSize: '0.6875rem', color: 'var(--text-faint)', fontFamily: 'var(--font-mono)' }}>
              {formatDuration(tc.duration)}
            </span>
          )}

          {/* Time */}
          <span style={{ fontSize: '0.6875rem', color: 'var(--text-faint)', marginLeft: 'auto' }}>
            {formatTime(tc.timestamp)}
          </span>
        </div>

        {/* Input summary */}
        <div
          style={{
            marginTop: '6px',
            padding: '4px 8px',
            background: 'var(--bg-secondary)',
            borderRadius: '4px',
            fontSize: '0.75rem',
            fontFamily: 'var(--font-mono)',
            color: 'var(--text-muted)',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-all',
            maxHeight: '60px',
            overflow: 'auto',
          }}
        >
          {tc.input || '(no input)'}
        </div>
      </div>

      {/* Output */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div
          style={{
            padding: '0 12px 4px',
            fontSize: '0.6875rem',
            fontWeight: 600,
            color: 'var(--text-faint)',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
          }}
        >
          Output
        </div>
        <div
          style={{
            flex: 1,
            margin: '0 12px 8px',
            padding: '8px',
            background: 'var(--bg-secondary)',
            borderRadius: '4px',
            border: '1px solid var(--border-muted)',
            overflow: 'auto',
            fontSize: '0.75rem',
            fontFamily: 'var(--font-mono)',
            lineHeight: '1.5',
            color: 'var(--text)',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
        >
          {tc.output || (
            <span style={{ color: 'var(--text-faint)', fontStyle: 'italic' }}>
              No output captured
            </span>
          )}
        </div>
      </div>
    </div>
  );
});

// ─── Helper components ───────────────────────────────────────────────────────

function StepCounter({ step, total }: { step: number; total: number }): React.ReactElement {
  return (
    <span style={{
      fontSize: '0.625rem',
      fontWeight: 600,
      color: 'var(--text-faint)',
      fontFamily: 'var(--font-mono)',
      textTransform: 'uppercase',
      letterSpacing: '0.05em',
    }}>
      Step {step} of {total}
    </span>
  );
}

function MetadataGrid({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'auto 1fr',
      gap: '4px 12px',
      fontSize: '0.75rem',
      fontFamily: 'var(--font-mono)',
    }}>
      {children}
    </div>
  );
}

function MetadataRow({ label, value, color }: { label: string; value: string; color?: string }): React.ReactElement {
  return (
    <>
      <span style={{ color: 'var(--text-faint)', whiteSpace: 'nowrap' }}>{label}</span>
      <span style={{ color: color ?? 'var(--text-muted)' }}>{value}</span>
    </>
  );
}
