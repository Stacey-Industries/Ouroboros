/**
 * StepDetail.tsx - Detailed view of a single replay step.
 *
 * For tool calls: shows tool name, input, output, duration, and status.
 * For session start: shows task label and session metadata.
 * Output is shown in a scrollable monospace block with syntax highlighting hints.
 */

import React, { memo } from 'react';

import { estimateCost, formatCost, formatTokenCount } from '../AgentMonitor/costCalculator';
import type { AgentSession } from '../AgentMonitor/types';
import {
  EMPTY_OUTPUT_STYLE,
  META_TEXT_STYLE,
  METADATA_GRID_STYLE,
  METADATA_LABEL_STYLE,
  OUTPUT_CONTAINER_STYLE,
  OUTPUT_LABEL_STYLE,
  OUTPUT_PANEL_STYLE,
  SESSION_LABEL_STYLE,
  SESSION_START_STYLE,
  SESSION_TITLE_STYLE,
  STATUS_TEXT_STYLE,
  STEP_COUNTER_STYLE,
  TOOL_BADGE_STYLE,
  TOOL_DETAIL_STYLE,
  TOOL_HEADER_STYLE,
  TOOL_INPUT_STYLE,
  TOOL_META_STYLE,
} from './StepDetail.styles';
import type { ReplayStep } from './types';

interface StepDetailProps {
  step: ReplayStep;
  session: AgentSession;
  stepNumber: number;
  totalSteps: number;
}

const TOOL_COLOR: Record<string, string> = {
  Read: 'var(--interactive-accent)',
  Edit: 'var(--status-warning)',
  Write: 'var(--status-warning)',
  Bash: 'var(--status-success)',
  Grep: 'var(--palette-purple)',
  Glob: 'var(--palette-purple)',
};

type ReplayToolCall = NonNullable<ReplayStep['toolCall']>;

interface MetadataItem {
  label: string;
  value: string;
  color?: string;
}

interface SessionStartDetailProps {
  session: AgentSession;
  stepNumber: number;
  totalSteps: number;
}

interface ToolCallDetailProps {
  toolCall: ReplayToolCall;
  stepNumber: number;
  totalSteps: number;
}

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
  if (status === 'complete' || status === 'success') return 'var(--status-success)';
  if (status === 'error') return 'var(--status-error)';
  return 'var(--interactive-accent)';
}

function hasTokenUsage(session: AgentSession): boolean {
  return session.inputTokens > 0 || session.outputTokens > 0;
}

function estimateSessionCost(session: AgentSession): string {
  return formatCost(
    estimateCost({
      inputTokens: session.inputTokens,
      outputTokens: session.outputTokens,
      model: session.model ?? 'claude-sonnet-4-20250514',
      cacheReadTokens: session.cacheReadTokens,
      cacheWriteTokens: session.cacheWriteTokens,
    }).totalCost,
  );
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
}: StepDetailProps): React.JSX.Element {
  if (step.type === 'session_start') {
    return <SessionStartDetail session={session} stepNumber={stepNumber} totalSteps={totalSteps} />;
  }

  return (
    <ToolCallDetail toolCall={step.toolCall!} stepNumber={stepNumber} totalSteps={totalSteps} />
  );
});

function SessionStartDetail({
  session,
  stepNumber,
  totalSteps,
}: SessionStartDetailProps): React.JSX.Element {
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

function SessionHeading({ taskLabel }: { taskLabel: string }): React.JSX.Element {
  return (
    <>
      <h3 className="text-text-semantic-primary" style={SESSION_TITLE_STYLE}>
        Session Started
      </h3>
      <div className="text-text-semantic-muted" style={SESSION_LABEL_STYLE}>
        {taskLabel}
      </div>
    </>
  );
}

function ToolCallDetail({
  toolCall,
  stepNumber,
  totalSteps,
}: ToolCallDetailProps): React.JSX.Element {
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

function ToolCallMetaHeader({ toolCall }: { toolCall: ReplayToolCall }): React.JSX.Element {
  return (
    <div style={TOOL_META_STYLE}>
      <ToolBadge name={toolCall.toolName} />
      <ToolStatus status={toolCall.status} />
      {toolCall.duration === undefined ? null : <ToolDuration duration={toolCall.duration} />}
      <ToolTimestamp timestamp={toolCall.timestamp} />
    </div>
  );
}

function ToolBadge({ name }: { name: string }): React.JSX.Element {
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

function ToolStatus({ status }: { status: ReplayToolCall['status'] }): React.JSX.Element {
  return (
    <span style={{ ...STATUS_TEXT_STYLE, color: statusColor(status) }}>{status.toUpperCase()}</span>
  );
}

function ToolDuration({ duration }: { duration: number }): React.JSX.Element {
  return (
    <span
      className="text-text-semantic-faint"
      style={{ ...META_TEXT_STYLE, fontFamily: 'var(--font-mono)' }}
    >
      {formatDuration(duration)}
    </span>
  );
}

function ToolTimestamp({ timestamp }: { timestamp: number }): React.JSX.Element {
  return (
    <span className="text-text-semantic-faint" style={{ ...META_TEXT_STYLE, marginLeft: 'auto' }}>
      {formatTime(timestamp)}
    </span>
  );
}

function ToolInputSummary({ input }: { input?: string }): React.JSX.Element {
  return (
    <div className="bg-surface-panel text-text-semantic-muted" style={TOOL_INPUT_STYLE}>
      {input || '(no input)'}
    </div>
  );
}

function OutputPanel({ output }: { output?: string }): React.JSX.Element {
  return (
    <div style={OUTPUT_CONTAINER_STYLE}>
      <div className="text-text-semantic-faint" style={OUTPUT_LABEL_STYLE}>
        Output
      </div>
      <div className="bg-surface-panel text-text-semantic-primary" style={OUTPUT_PANEL_STYLE}>
        {output || (
          <span className="text-text-semantic-faint" style={EMPTY_OUTPUT_STYLE}>
            No output captured
          </span>
        )}
      </div>
    </div>
  );
}

function StepCounter({ step, total }: { step: number; total: number }): React.JSX.Element {
  return (
    <span className="text-text-semantic-faint" style={STEP_COUNTER_STYLE}>
      Step {step} of {total}
    </span>
  );
}

function MetadataGrid({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <div style={METADATA_GRID_STYLE}>{children}</div>;
}

function MetadataRow({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color?: string;
}): React.JSX.Element {
  return (
    <>
      <span className="text-text-semantic-faint" style={METADATA_LABEL_STYLE}>
        {label}
      </span>
      <span
        style={{ color: color ?? undefined }}
        className={color ? undefined : 'text-text-semantic-muted'}
      >
        {value}
      </span>
    </>
  );
}
