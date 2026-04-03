/**
 * HooksApprovalSubsection.tsx — Tool approval settings.
 */

import React, { useRef, useState } from 'react';

import type { AppConfig } from '../../types/electron';
import { SectionLabel } from './settingsStyles';

const COMMON_TOOLS = ['Write', 'Bash', 'Edit', 'Read', 'Grep', 'Glob'];

interface Props {
  draft: AppConfig;
  onChange: <K extends keyof AppConfig>(key: K, value: AppConfig[K]) => void;
}

export function ApprovalSubsection({ draft, onChange }: Props): React.ReactElement {
  const currentTools = draft.approvalRequired ?? [];

  function toggleTool(tool: string): void {
    if (currentTools.includes(tool)) {
      onChange(
        'approvalRequired',
        currentTools.filter((t) => t !== tool),
      );
    } else {
      onChange('approvalRequired', [...currentTools, tool]);
    }
  }

  return (
    <>
      <section>
        <SectionLabel>Pre-Execution Approval</SectionLabel>
        <p className="text-text-semantic-muted" style={descStyle}>
          Require manual approval before Claude Code executes certain tools.
        </p>
        <ToolToggleGrid tools={COMMON_TOOLS} currentTools={currentTools} onToggle={toggleTool} />
        <ApprovalStatus currentTools={currentTools} />
        <CustomToolInput
          currentTools={currentTools}
          onAdd={(t) => onChange('approvalRequired', [...currentTools, t])}
        />
      </section>
      <TimeoutSection draft={draft} onChange={onChange} />
    </>
  );
}

function ToolToggleGrid({
  tools,
  currentTools,
  onToggle,
}: {
  tools: string[];
  currentTools: string[];
  onToggle: (tool: string) => void;
}): React.ReactElement {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '10px' }}>
      {tools.map((tool) => {
        const isActive = currentTools.includes(tool);
        return (
          <button key={tool} onClick={() => onToggle(tool)} style={toolBtnStyle(isActive)}>
            {tool}
          </button>
        );
      })}
    </div>
  );
}

function ApprovalStatus({ currentTools }: { currentTools: string[] }): React.ReactElement {
  return (
    <div className="text-text-semantic-primary" style={statusBoxStyle}>
      {currentTools.length === 0 ? (
        <span className="text-text-semantic-muted">No tools require approval.</span>
      ) : (
        <>
          <span className="text-text-semantic-muted">Requiring approval: </span>
          {currentTools.join(', ')}
        </>
      )}
    </div>
  );
}

function CustomToolInputRow({
  value,
  disabled,
  inputRef,
  onChange,
  onKeyDown,
  onAdd,
}: {
  value: string;
  disabled: boolean;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  onAdd: () => void;
}): React.ReactElement {
  return (
    <div style={{ display: 'flex', gap: '6px' }}>
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={onChange}
        onKeyDown={onKeyDown}
        placeholder="Custom tool name..."
        className="text-text-semantic-primary"
        style={inputStyle}
      />
      <button onClick={onAdd} disabled={disabled} style={addBtnStyle(!value.trim())}>
        Add
      </button>
    </div>
  );
}

function CustomToolInput({
  currentTools,
  onAdd,
}: {
  currentTools: string[];
  onAdd: (tool: string) => void;
}): React.ReactElement {
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  function handleAdd(): void {
    const trimmed = value.trim();
    if (trimmed && !currentTools.includes(trimmed)) {
      onAdd(trimmed);
      setValue('');
    }
  }

  return (
    <CustomToolInputRow
      value={value}
      disabled={!value.trim() || currentTools.includes(value.trim())}
      inputRef={inputRef}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          handleAdd();
        }
      }}
      onAdd={handleAdd}
    />
  );
}

function TimeoutSection({ draft, onChange }: Props): React.ReactElement {
  return (
    <section>
      <SectionLabel>Auto-Approve Timeout</SectionLabel>
      <p className="text-text-semantic-muted" style={descStyle}>
        Auto-approve tool calls after a timeout (seconds). Set to 0 for manual approval.
      </p>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <input
          type="number"
          min={0}
          max={300}
          value={draft.approvalTimeout ?? 0}
          onChange={(e) => {
            const val = parseInt(e.target.value, 10);
            if (!isNaN(val) && val >= 0 && val <= 300) onChange('approvalTimeout', val);
          }}
          aria-label="Auto-approve timeout in seconds"
          className="text-text-semantic-primary"
          style={numberInputStyle}
        />
        <span className="text-text-semantic-muted" style={{ fontSize: '12px' }}>
          {(draft.approvalTimeout ?? 0) === 0
            ? 'Never auto-approve'
            : `Auto-approve after ${draft.approvalTimeout}s`}
        </span>
      </div>
    </section>
  );
}

const descStyle: React.CSSProperties = { fontSize: '12px', marginBottom: '10px' };

const statusBoxStyle: React.CSSProperties = {
  padding: '8px 12px',
  borderRadius: '6px',
  border: '1px solid var(--border-default)',
  background: 'var(--surface-raised)',
  fontSize: '12px',
  marginBottom: '10px',
};

function toolBtnStyle(isActive: boolean): React.CSSProperties {
  return {
    padding: '4px 10px',
    borderRadius: '4px',
    border: `1px solid ${isActive ? 'var(--interactive-accent)' : 'var(--border-default)'}`,
    background: isActive ? 'var(--interactive-accent)' : 'transparent',
    color: isActive ? 'var(--text-on-accent)' : 'var(--text-muted)',
    fontSize: '12px',
    cursor: 'pointer',
    fontWeight: isActive ? 600 : 400,
    transition: 'all 0.15s',
  };
}

const inputStyle: React.CSSProperties = {
  flex: 1,
  padding: '6px 10px',
  borderRadius: '6px',
  border: '1px solid var(--border-default)',
  background: 'var(--surface-raised)',
  fontSize: '12px',
  outline: 'none',
};

function addBtnStyle(disabled: boolean): React.CSSProperties {
  return {
    padding: '6px 12px',
    borderRadius: '6px',
    border: '1px solid var(--border-default)',
    background: 'var(--surface-raised)',
    color: disabled ? 'var(--text-muted)' : 'var(--text-primary)',
    fontSize: '12px',
    cursor: disabled ? 'not-allowed' : 'pointer',
  };
}

const numberInputStyle: React.CSSProperties = {
  width: '80px',
  padding: '7px 10px',
  borderRadius: '6px',
  border: '1px solid var(--border-default)',
  background: 'var(--surface-raised)',
  fontSize: '13px',
  fontFamily: 'var(--font-mono)',
  outline: 'none',
};
