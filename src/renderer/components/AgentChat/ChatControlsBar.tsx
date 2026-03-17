import React from 'react';

export interface ChatOverrides {
  model: string;
  effort: string;
  permissionMode: string;
}

/** Map a model ID (or empty string) to a short display name. */
function modelDisplayName(modelId: string): string {
  if (!modelId) return 'Sonnet';
  if (modelId.includes('opus')) return 'Opus';
  if (modelId.includes('haiku')) return 'Haiku';
  if (modelId.includes('sonnet')) return 'Sonnet';
  return modelId;
}

function buildModelOptions(settingsModel: string): Array<{ value: string; label: string }> {
  const defaultLabel = `Default (${modelDisplayName(settingsModel)})`;
  return [
    { value: '', label: defaultLabel },
    { value: 'claude-sonnet-4-6', label: 'Sonnet 4.6 (200K)' },
    { value: 'claude-opus-4-6', label: 'Opus 4.6 (1M)' },
    { value: 'claude-haiku-4-5-20251001', label: 'Haiku 4.5 (200K)' },
  ];
}

const EFFORT_OPTIONS = [
  { value: '', label: 'Default' },
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'max', label: 'Max' },
] as const;

export const PERMISSION_MODES = [
  { value: 'default', label: 'Default' },
  { value: 'acceptEdits', label: 'Accept Edits' },
  { value: 'plan', label: 'Plan' },
  { value: 'auto', label: 'Auto' },
  { value: 'bypassPermissions', label: 'Bypass' },
] as const;

/** Returns the next permission mode in the cycle. */
export function cyclePermissionMode(current: string): string {
  const idx = PERMISSION_MODES.findIndex((m) => m.value === current);
  return PERMISSION_MODES[(idx + 1) % PERMISSION_MODES.length].value;
}

function ControlSelect(props: {
  label: string;
  value: string;
  options: ReadonlyArray<{ value: string; label: string }>;
  onChange: (value: string) => void;
}): React.ReactElement {
  return (
    <div
      className="flex items-center gap-1"
      style={{
        backgroundColor: 'var(--bg-tertiary)',
        borderRadius: '9999px',
        padding: '2px 8px',
      }}
    >
      <span className="text-[10px] font-medium uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
        {props.label}
      </span>
      <select
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        className="border-none bg-transparent px-0.5 py-0 text-[11px] text-[var(--text)] focus:outline-none cursor-pointer"
        style={{ fontFamily: 'var(--font-ui)', colorScheme: 'dark' }}
      >
        {props.options.map((opt) => (
          <option
            key={opt.value}
            value={opt.value}
            style={{ backgroundColor: 'var(--bg-secondary, #1e1e1e)', color: 'var(--text, #e0e0e0)' }}
          >
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function PermissionModeIndicator(props: {
  value: string;
  onChange: (value: string) => void;
}): React.ReactElement {
  const current = PERMISSION_MODES.find((m) => m.value === props.value) ?? PERMISSION_MODES[0];

  return (
    <button
      onClick={() => props.onChange(cyclePermissionMode(props.value))}
      className="flex items-center gap-1 text-[11px] transition-colors duration-150"
      style={{
        color: 'var(--text-muted)',
        fontFamily: 'var(--font-ui)',
        backgroundColor: 'var(--bg-tertiary)',
        borderRadius: '9999px',
        padding: '2px 8px',
      }}
      title="Permission mode (Shift+Tab to cycle)"
      onMouseEnter={(e) => {
        e.currentTarget.style.backgroundColor = 'var(--bg-hover, var(--border))';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)';
      }}
    >
      <span className="text-[10px] font-medium uppercase tracking-wide">Mode</span>
      <span style={{ color: 'var(--text)' }}>{current.label}</span>
    </button>
  );
}

function formatTokenCount(count: number): string {
  if (count < 1000) return String(count);
  if (count < 1_000_000) return `${(count / 1000).toFixed(1)}k`;
  return `${(count / 1_000_000).toFixed(1)}M`;
}

function TokenUsageIndicator(props: {
  inputTokens: number;
  outputTokens: number;
}): React.ReactElement | null {
  if (props.inputTokens === 0 && props.outputTokens === 0) return null;

  const showInput = props.inputTokens > 0;
  const title = showInput
    ? `Context: ${props.inputTokens.toLocaleString()} tokens · Output: ${props.outputTokens.toLocaleString()} tokens`
    : `Output: ${props.outputTokens.toLocaleString()} tokens`;

  return (
    <div
      className="flex items-center gap-1.5 text-[11px]"
      style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}
      title={title}
    >
      {showInput && (
        <>
          <span style={{ color: 'var(--text)' }}>{formatTokenCount(props.inputTokens)}</span>
          <span style={{ opacity: 0.5 }}>in</span>
          <span style={{ opacity: 0.3 }}>/</span>
        </>
      )}
      <span style={{ color: 'var(--text)' }}>{formatTokenCount(props.outputTokens)}</span>
      <span style={{ opacity: 0.5 }}>out</span>
    </div>
  );
}

export function ChatControlsBar(props: {
  overrides: ChatOverrides;
  onChange: (overrides: ChatOverrides) => void;
  /** Model ID from settings (e.g. 'claude-opus-4-6'). Empty = Sonnet default. */
  settingsModel?: string;
  /** Cumulative token usage for the active thread. */
  threadTokenUsage?: { inputTokens: number; outputTokens: number };
}): React.ReactElement {
  const modelOptions = buildModelOptions(props.settingsModel ?? '');

  return (
    <div className="flex items-center gap-3 px-3 py-1">
      <ControlSelect
        label="Model"
        value={props.overrides.model}
        options={modelOptions}
        onChange={(model) => props.onChange({ ...props.overrides, model })}
      />
      <ControlSelect
        label="Effort"
        value={props.overrides.effort}
        options={EFFORT_OPTIONS}
        onChange={(effort) => props.onChange({ ...props.overrides, effort })}
      />
      <PermissionModeIndicator
        value={props.overrides.permissionMode}
        onChange={(permissionMode) => props.onChange({ ...props.overrides, permissionMode })}
      />
      {props.threadTokenUsage && (
        <>
          <div className="mx-0.5 h-3 w-px" style={{ backgroundColor: 'var(--border)' }} />
          <TokenUsageIndicator
            inputTokens={props.threadTokenUsage.inputTokens}
            outputTokens={props.threadTokenUsage.outputTokens}
          />
        </>
      )}
    </div>
  );
}
