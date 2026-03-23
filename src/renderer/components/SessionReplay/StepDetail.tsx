/**
 * StepDetail.tsx - Detailed view of a single replay step.
 *
 * For tool calls: shows tool name, input, output, duration, and status.
 * For session start: shows task label and session metadata.
 * Output is shown in a scrollable monospace block with syntax highlighting hints.
 */

import React, { memo } from 'react';

import { estimateCost, formatCost,formatTokenCount } from '../AgentMonitor/costCalculator';
import type { AgentSession } from '../AgentMonitor/types';
import type { ReplayStep } from './types';

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

const SESSION_START_STYLE: React.CSSProperties = { padding: '12px', fontFamily: 'var(--font-ui)' };

const TOOL_DETAIL_STYLE: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  overflow: 'hidden',
};

const TOOL_HEADER_STYLE: React.CSSProperties = { flexShrink: 0, padding: '8px 12px' };

const TOOL_META_STYLE: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px' };

const TOOL_BADGE_STYLE: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '2px 8px',
  borderRadius: '4px',
  fontSize: '0.75rem',
  fontWeight: 600,
  fontFamily: 'var(--font-mono)',
};

const STATUS_TEXT_STYLE: React.CSSProperties = { fontSize: '0.6875rem', fontWeight: 500 };

const META_TEXT_STYLE: React.CSSProperties = { fontSize: '0.6875rem' };

const TOOL_INPUT_STYLE: React.CSSProperties = {
  marginTop: '6px',
  padding: '4px 8px',
  borderRadius: '4px',
  fontSize: '0.75rem',
  fontFamily: 'var(--font-mono)',
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-all',
  maxHeight: '60px',
  overflow: 'auto',
};

const OUTPUT_CONTAINER_STYLE: React.CSSProperties = {
  flex: 1,
  overflow: 'hidden',
  display: 'flex',
  flexDirection: 'column',
};

const OUTPUT_LABEL_STYLE: React.CSSProperties = {
  padding: '0 12px 4px',
  fontSize: '0.6875rem',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
};

const OUTPUT_PANEL_STYLE: React.CSSProperties = {
  flex: 1,
  margin: '0 12px 8px',
  padding: '8px',
  borderRadius: '4px',
  border: '1px solid var(--border-muted)',
  overflow: 'auto',
  fontSize: '0.75rem',
  fontFamily: 'var(--font-mono)',
  lineHeight: '1.5',
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
};

const EMPTY_OUTPUT_STYLE: React.CSSProperties = { fontStyle: 'italic' };

const STEP_COUNTER_STYLE: React.CSSProperties = {
  fontSize: '0.625rem',
  fontWeight: 600,
  fontFamily: 'var(--font-mono)',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
};

const SESSION_TITLE_STYLE: React.CSSProperties = {
  margin: '8px 0 4px',
  fontSize: '0.875rem',
  fontWeight: 600,
};

const SESSION_LABEL_STYLE: React.CSSProperties = { fontSize: '0.8125rem', marginBottom: '12px' };

const METADATA_GRID_STYLE: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'auto 1fr',
  gap: '4px 12px',
  fontSize: '0.75rem',
  fontFamily: 'var(--font-mono)',
};

const METADATA_LABEL_STYLE: React.CSSProperties = { whiteSpace: 'nowrap' };

type ReplayToolCall = NonNullable<ReplayStep['toolCall']>;

interface MetadataItem { label: string; value: string; color?: string; }

interface SessionStartDetailProps { session: AgentSession; stepNumber: number; totalSteps: number; }

interface ToolCallDetailProps { toolCall: ReplayToolCall; stepNumber: number; totalSteps: number; }

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

function statusColor(status: AgentSession['status'] | ReplayToolCall['status']): string {
  if (status === 'complete' || status === 'success') return 'var(--success, #4CAF50)';
  if (status === 'error') return 'var(--error, #f85149)';
  return 'var(--accent)';
}

function hasTokenUsage(session: AgentSession): boolean {
  return session.inputTokens > 0 || session.outputTokens > 0;
}

function estimateSessionCost(session: AgentSession): string {
  return formatCost(estimateCost({
    inputTokens: session.inputTokens,
    outputTokens: session.outputTokens,
    model: session.model ?? 'claude-sonnet-4-20250514',
    cacheReadTokens: session.cacheReadTokens,
    cacheWriteTokens: session.cacheWriteTokens,
  }).totalCost);
}

function getSessionMetadata(session: AgentSession): MetadataItem[] {
  const metadata: MetadataItem[] = [{ label: 'Started', value: formatTime(session.startedAt) }];

  if (session.completedAt !== undefined) {
    metadata.push({
      label: 'Duration',
      value: formatDuration(session.completedAt - session.startedAt),
    });
  }

  if (session.model !== undefined) {
    metadata.push({ label: 'Model', value: session.model });
  }

  metadata.push({ label: 'Tool Calls', value: String(session.toolCalls.length) });

  if (hasTokenUsage(session)) {
    metadata.push({ label: 'Input Tokens', value: formatTokenCount(session.inputTokens) });
    metadata.push({ label: 'Output Tokens', value: formatTokenCount(session.outputTokens) });
    metadata.push({ label: 'Estimated Cost', value: estimateSessionCost(session) });
  }

  metadata.push({ label: 'Status', value: session.status, color: statusColor(session.status) });
  return metadata;
}

export const StepDetail = memo(function StepDetail({
  step,
  session,
  stepNumber,
  totalSteps,
}: StepDetailProps): React.ReactElement {
  if (step.type === 'session_start') {
    return <SessionStartDetail session={session} stepNumber={stepNumber} totalSteps={totalSteps} />;
  }

  return <ToolCallDetail toolCall={step.toolCall!} stepNumber={stepNumber} totalSteps={totalSteps} />;
});

function SessionStartDetail({
  session,
  stepNumber,
  totalSteps,
}: SessionStartDetailProps): React.ReactElement {
  const metadata = getSessionMetadata(session);

  return (
    <div style={SESSION_START_STYLE}>
      <StepCounter step={stepNumber} total={totalSteps} />
      <SessionHeading taskLabel={session.taskLabel} />
      <MetadataGrid>
        {metadata.map((item) => (
          <MetadataRow key={item.label} label={item.label} value={item.value} color={item.color} />
        ))}
      </MetadataGrid>
    </div>
  );
}

function SessionHeading({ taskLabel }: { taskLabel: string }): React.ReactElement {
  return (
    <>
      <h3 className="text-text-semantic-primary" style={SESSION_TITLE_STYLE}>Session Started</h3>
      <div className="text-text-semantic-muted" style={SESSION_LABEL_STYLE}>{taskLabel}</div>
    </>
  );
}

function ToolCallDetail({
  toolCall,
  stepNumber,
  totalSteps,
}: ToolCallDetailProps): React.ReactElement {
  return (
    <div style={TOOL_DETAIL_STYLE}>
      <div style={TOOL_HEADER_STYLE}>
        <StepCounter step={stepNumber} total={totalSteps} />
        <ToolCallMetaHeader toolCall={toolCall} />
        <ToolInputSummary input={toolCall.input} />
      </div>
      <OutputPanel output={toolCall.output} />
    </div>
  );
}

function ToolCallMetaHeader({ toolCall }: { toolCall: ReplayToolCall }): React.ReactElement {
  return (
    <div style={TOOL_META_STYLE}>
      <ToolBadge name={toolCall.toolName} />
      <ToolStatus status={toolCall.status} />
      {toolCall.duration === undefined ? null : <ToolDuration duration={toolCall.duration} />}
      <ToolTimestamp timestamp={toolCall.timestamp} />
    </div>
  );
}

function ToolBadge({ name }: { name: string }): React.ReactElement {
  const color = toolColor(name);

  return (
    <span
      style={{
        ...TOOL_BADGE_STYLE,
        color,
        border: `1px solid ${color}`,
        background: `color-mix(in srgb, ${color} 10%, transparent)`,
      }}
    >
      {name}
    </span>
  );
}

function ToolStatus({ status }: { status: ReplayToolCall['status'] }): React.ReactElement {
  return <span style={{ ...STATUS_TEXT_STYLE, color: statusColor(status) }}>{status.toUpperCase()}</span>;
}

function ToolDuration({ duration }: { duration: number }): React.ReactElement {
  return <span className="text-text-semantic-faint" style={{ ...META_TEXT_STYLE, fontFamily: 'var(--font-mono)' }}>{formatDuration(duration)}</span>;
}

function ToolTimestamp({ timestamp }: { timestamp: number }): React.ReactElement {
  return <span className="text-text-semantic-faint" style={{ ...META_TEXT_STYLE, marginLeft: 'auto' }}>{formatTime(timestamp)}</span>;
}

function ToolInputSummary({ input }: { input?: string }): React.ReactElement {
  return <div className="bg-surface-panel text-text-semantic-muted" style={TOOL_INPUT_STYLE}>{input || '(no input)'}</div>;
}

function OutputPanel({ output }: { output?: string }): React.ReactElement {
  return (
    <div style={OUTPUT_CONTAINER_STYLE}>
      <div className="text-text-semantic-faint" style={OUTPUT_LABEL_STYLE}>Output</div>
      <div className="bg-surface-panel text-text-semantic-primary" style={OUTPUT_PANEL_STYLE}>
        {output || <span className="text-text-semantic-faint" style={EMPTY_OUTPUT_STYLE}>No output captured</span>}
      </div>
    </div>
  );
}

function StepCounter({ step, total }: { step: number; total: number }): React.ReactElement {
  return <span className="text-text-semantic-faint" style={STEP_COUNTER_STYLE}>Step {step} of {total}</span>;
}

function MetadataGrid({ children }: { children: React.ReactNode }): React.ReactElement {
  return <div style={METADATA_GRID_STYLE}>{children}</div>;
}

function MetadataRow({ label, value, color }: { label: string; value: string; color?: string }): React.ReactElement {
  return (
    <>
      <span className="text-text-semantic-faint" style={METADATA_LABEL_STYLE}>{label}</span>
      <span style={{ color: color ?? undefined }} className={color ? undefined : 'text-text-semantic-muted'}>{value}</span>
    </>
  );
}
