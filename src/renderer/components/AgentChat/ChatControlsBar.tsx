import React from 'react';

export interface ChatOverrides {
  model: string;
  effort: string;
  permissionMode: string;
}

/** Map a model ID/alias to a short display name. */
function modelDisplayName(modelId: string): string {
  if (!modelId) return 'Sonnet';
  // Claude Code CLI uses [1m] suffix for extended context variants
  const is1m = modelId.includes('[1m]');
  const suffix = is1m ? ' 1M' : '';
  if (modelId.includes('opus')) return `Opus${suffix}`;
  if (modelId.includes('haiku')) return 'Haiku';
  if (modelId.includes('sonnet')) return `Sonnet${suffix}`;
  return modelId;
}

function buildModelOptions(settingsModel: string): Array<{ value: string; label: string }> {
  const defaultLabel = `Default (${modelDisplayName(settingsModel)})`;
  return [
    { value: '', label: defaultLabel },
    { value: 'opus[1m]', label: 'Opus 4.6 (1M)' },
    { value: 'opus', label: 'Opus 4.6 (200K)' },
    { value: 'sonnet', label: 'Sonnet 4.6 (200K)' },
    { value: 'haiku', label: 'Haiku 4.5 (200K)' },
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

/** Known context window limits by model variant. */
function getContextLimit(modelId: string): number {
  // Claude Code CLI uses [1m] suffix for 1M context variants
  if (modelId.includes('[1m]')) return 1_000_000;
  // All base models (opus, sonnet, haiku) use 200K
  return 200_000;
}

function ModelContextUsageIndicator(props: {
  usage: Array<{ model: string; inputTokens: number; outputTokens: number }>;
}): React.ReactElement | null {
  if (props.usage.length === 0) return null;

  return (
    <div
      className="flex items-center gap-3 text-[11px]"
      style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}
    >
      {props.usage.map((entry) => {
        const name = modelDisplayName(entry.model);
        const limit = getContextLimit(entry.model);
        const pct = Math.min(100, Math.round((entry.inputTokens / limit) * 100));
        const title = `${name}: ${entry.inputTokens.toLocaleString()} / ${limit.toLocaleString()} context tokens (${pct}%) · ${entry.outputTokens.toLocaleString()} output tokens`;

        return (
          <div key={entry.model} className="flex items-center gap-1.5" title={title}>
            <span style={{ opacity: 0.6 }}>{name}</span>
            <div
              style={{
                width: 40,
                height: 4,
                borderRadius: 2,
                backgroundColor: 'var(--border)',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width: `${pct}%`,
                  height: '100%',
                  borderRadius: 2,
                  backgroundColor: pct >= 90 ? 'var(--error, #ef4444)' : pct >= 70 ? 'var(--warning, #f59e0b)' : 'var(--accent)',
                  transition: 'width 0.3s ease',
                }}
              />
            </div>
            <span style={{ color: 'var(--text)' }}>{formatTokenCount(entry.inputTokens)}</span>
          </div>
        );
      })}
    </div>
  );
}

export function ChatControlsBar(props: {
  overrides: ChatOverrides;
  onChange: (overrides: ChatOverrides) => void;
  /** Model ID from settings (e.g. 'claude-opus-4-6'). Empty = Sonnet default. */
  settingsModel?: string;
  /** Per-model context usage for the active thread. */
  threadModelUsage?: Array<{ model: string; inputTokens: number; outputTokens: number }>;
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
      {props.threadModelUsage && props.threadModelUsage.length > 0 && (
        <>
          <div className="mx-0.5 h-3 w-px" style={{ backgroundColor: 'var(--border)' }} />
          <ModelContextUsageIndicator usage={props.threadModelUsage} />
        </>
      )}
    </div>
  );
}
