/**
 * DispatchForm.parts.tsx — worktree toggle + name field sub-components.
 * Extracted from DispatchForm.tsx to stay within the 300-line file limit.
 *
 * Wave 34 Phase E.
 */

import React, { useId } from 'react';

import {
  FIELD_GROUP_STYLE,
  INPUT_STYLE,
  SECTION_LABEL_STYLE,
} from './DispatchScreen.styles';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface WorktreeFieldsProps {
  enabled: boolean;
  name: string;
  onToggle: (enabled: boolean) => void;
  onNameChange: (name: string) => void;
}

// ── WorktreeToggle ────────────────────────────────────────────────────────────

const TOGGLE_ROW_STYLE: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  marginBottom: '6px',
};

const TOGGLE_LABEL_STYLE: React.CSSProperties = {
  fontSize: '12px',
  fontWeight: 500,
  cursor: 'pointer',
  userSelect: 'none',
};

const CHECKBOX_STYLE: React.CSSProperties = {
  width: '14px',
  height: '14px',
  cursor: 'pointer',
  accentColor: 'var(--interactive-accent)',
};

function WorktreeToggle({
  checkboxId,
  enabled,
  onToggle,
}: {
  checkboxId: string;
  enabled: boolean;
  onToggle: (v: boolean) => void;
}): React.ReactElement {
  return (
    <div style={TOGGLE_ROW_STYLE}>
      <input
        id={checkboxId}
        type="checkbox"
        checked={enabled}
        onChange={(e) => onToggle(e.target.checked)}
        style={CHECKBOX_STYLE}
        data-testid="dispatch-worktree-toggle"
      />
      <label htmlFor={checkboxId} style={TOGGLE_LABEL_STYLE}>
        Create git worktree
      </label>
    </div>
  );
}

// ── WorktreeNameField ─────────────────────────────────────────────────────────

function WorktreeNameField({
  inputId,
  name,
  onNameChange,
}: {
  inputId: string;
  name: string;
  onNameChange: (v: string) => void;
}): React.ReactElement {
  return (
    <div>
      <label
        htmlFor={inputId}
        style={{ ...SECTION_LABEL_STYLE, color: 'var(--text-secondary)' }}
      >
        Worktree name *
      </label>
      <input
        id={inputId}
        type="text"
        value={name}
        onChange={(e) => onNameChange(e.target.value)}
        placeholder="e.g. feat/my-task"
        style={INPUT_STYLE}
        data-testid="dispatch-worktree-name-input"
      />
    </div>
  );
}

// ── WorktreeFields (composite) ────────────────────────────────────────────────

export function WorktreeFields({
  enabled,
  name,
  onToggle,
  onNameChange,
}: WorktreeFieldsProps): React.ReactElement {
  const id = useId();
  const checkboxId = `${id}-toggle`;
  const inputId = `${id}-name`;

  return (
    <div style={FIELD_GROUP_STYLE}>
      <WorktreeToggle checkboxId={checkboxId} enabled={enabled} onToggle={onToggle} />
      {enabled && (
        <WorktreeNameField
          inputId={inputId}
          name={name}
          onNameChange={onNameChange}
        />
      )}
    </div>
  );
}
