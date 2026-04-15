/**
 * ViewModeSelector.tsx — Segmented toggle for AgentMonitor view mode.
 *
 * Three options: Verbose / Normal / Summary.
 * Accepts value + onChange; emits telemetry on change.
 */

import React, { memo, useCallback } from 'react';

import type { AgentMonitorViewMode } from '../../types/electron';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ViewModeSelectorProps {
  value: AgentMonitorViewMode;
  onChange: (mode: AgentMonitorViewMode) => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────

interface ModeOption {
  value: AgentMonitorViewMode;
  label: string;
  title: string;
}

const OPTIONS: ModeOption[] = [
  { value: 'verbose', label: 'Verbose', title: 'Show all events' },
  { value: 'normal', label: 'Normal', title: 'Hide noisy file/dir events' },
  { value: 'summary', label: 'Summary', title: 'Show key lifecycle events only' },
];

// ─── Sub-components ───────────────────────────────────────────────────────────

function ModeButton({
  active,
  option,
  onSelect,
}: {
  active: boolean;
  option: ModeOption;
  onSelect: (mode: AgentMonitorViewMode) => void;
}): React.ReactElement {
  const handleClick = useCallback(() => onSelect(option.value), [onSelect, option.value]);

  return (
    <button
      type="button"
      onClick={handleClick}
      title={option.title}
      aria-pressed={active}
      aria-label={`View mode: ${option.label}`}
      className="px-2 py-0.5 text-[10px] font-medium transition-colors rounded-sm"
      style={{
        background: active ? 'var(--interactive-accent)' : 'transparent',
        color: active ? 'var(--text-on-accent)' : 'var(--text-faint)',
        border: 'none',
        cursor: 'pointer',
        lineHeight: 1.4,
      }}
    >
      {option.label}
    </button>
  );
}

// ─── ViewModeSelector ─────────────────────────────────────────────────────────

export const ViewModeSelector = memo(function ViewModeSelector({
  onChange,
  value,
}: ViewModeSelectorProps): React.ReactElement {
  const handleSelect = useCallback(
    (mode: AgentMonitorViewMode) => {
      if (mode === value) return;
      onChange(mode);
      if (typeof window !== 'undefined' && window.electronAPI) {
        void window.electronAPI.telemetry.record({
          kind: 'agent_monitor.view_mode',
          data: { viewMode: mode },
        });
      }
    },
    [onChange, value],
  );

  return (
    <div
      className="flex items-center gap-px rounded"
      style={{ border: '1px solid var(--border-subtle)', padding: '1px' }}
      role="group"
      aria-label="Agent monitor view mode"
    >
      {OPTIONS.map((option) => (
        <ModeButton
          key={option.value}
          active={value === option.value}
          option={option}
          onSelect={handleSelect}
        />
      ))}
    </div>
  );
});
