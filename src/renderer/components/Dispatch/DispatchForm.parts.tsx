/**
 * DispatchForm.parts.tsx — worktree toggle + name field sub-components.
 * Extracted from DispatchForm.tsx to stay within the 300-line file limit.
 *
 * Wave 34 Phase E.
 */

import React, { useId } from 'react';

import type { DispatchFormModel } from './DispatchForm.logic';
import {
  DANGER_BUTTON_STYLE,
  ERROR_TEXT_STYLE,
  FIELD_GROUP_STYLE,
  INPUT_STYLE,
  PRIMARY_BUTTON_STYLE,
  SCROLLABLE_BODY_STYLE,
  SECTION_LABEL_STYLE,
  SELECT_STYLE,
  TEXTAREA_STYLE,
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
      <label htmlFor={inputId} style={{ ...SECTION_LABEL_STYLE, color: 'var(--text-secondary)' }}>
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
      {enabled && <WorktreeNameField inputId={inputId} name={name} onNameChange={onNameChange} />}
    </div>
  );
}

// ── Dispatch form fields ──────────────────────────────────────────────────────

interface TitleFieldProps {
  id: string;
  value: string;
  onChange: (v: string) => void;
}

function TitleField({ id, value, onChange }: TitleFieldProps): React.ReactElement {
  return (
    <div style={FIELD_GROUP_STYLE}>
      <label htmlFor={id} style={{ ...SECTION_LABEL_STYLE, color: 'var(--text-secondary)' }}>
        Title *
      </label>
      <input
        id={id}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Brief task description"
        required
        style={INPUT_STYLE}
        data-testid="dispatch-title-input"
      />
    </div>
  );
}

function PromptField({ id, value, onChange }: TitleFieldProps): React.ReactElement {
  return (
    <div style={FIELD_GROUP_STYLE}>
      <label htmlFor={id} style={{ ...SECTION_LABEL_STYLE, color: 'var(--text-secondary)' }}>
        Prompt *
      </label>
      <textarea
        id={id}
        rows={6}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Describe the task in detail…"
        required
        style={TEXTAREA_STYLE}
        data-testid="dispatch-prompt-input"
      />
    </div>
  );
}

function ProjectField({
  id,
  roots,
  value,
  onChange,
}: {
  id: string;
  roots: string[];
  value: string;
  onChange: (v: string) => void;
}): React.ReactElement {
  return (
    <div style={FIELD_GROUP_STYLE}>
      <label htmlFor={id} style={{ ...SECTION_LABEL_STYLE, color: 'var(--text-secondary)' }}>
        Project
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={SELECT_STYLE}
        data-testid="dispatch-project-select"
      >
        {roots.length === 0 && <option value="">No projects configured</option>}
        {roots.map((root) => (
          <option key={root} value={root}>
            {root}
          </option>
        ))}
      </select>
    </div>
  );
}

function OfflineBadge({ count }: { count: number }): React.ReactElement | null {
  if (count === 0) return null;
  return (
    <p
      style={{ fontSize: '11px', marginBottom: '8px', color: 'var(--status-warning)' }}
      data-testid="offline-queue-badge"
    >
      {count} dispatch{count === 1 ? '' : 'es'} queued offline — will send on reconnect
    </p>
  );
}

interface SubmitAreaProps {
  submitting: boolean;
  isOffline: boolean;
  onCancelSubmit: () => void;
}

function SubmitArea({
  submitting,
  isOffline,
  onCancelSubmit,
}: SubmitAreaProps): React.ReactElement {
  const label = submitting ? 'Dispatching…' : isOffline ? 'Save — send when online' : 'Dispatch';
  return (
    <>
      <button
        type="submit"
        disabled={submitting}
        style={{ ...PRIMARY_BUTTON_STYLE, opacity: submitting ? 0.6 : 1 }}
        data-testid="dispatch-submit-btn"
      >
        {label}
      </button>
      {submitting && (
        <button
          type="button"
          onClick={onCancelSubmit}
          style={{ ...DANGER_BUTTON_STYLE, width: '100%', marginTop: '6px' }}
        >
          Cancel
        </button>
      )}
    </>
  );
}

export interface DispatchFormViewProps {
  model: DispatchFormModel;
  projectRoots: string[];
}

function DispatchFormStatusMessages({ model }: { model: DispatchFormModel }): React.ReactElement {
  return (
    <>
      {model.isOffline && (
        <p
          role="status"
          style={{
            ...ERROR_TEXT_STYLE,
            color: 'var(--status-warning)',
            border: '1px solid var(--status-warning)',
            backgroundColor: 'var(--status-warning-subtle)',
            marginBottom: '8px',
          }}
        >
          Desktop offline — your dispatch will send when we reconnect.
        </p>
      )}
      <OfflineBadge count={model.offlineCount} />
      {model.inlineError && (
        <p role="alert" style={{ ...ERROR_TEXT_STYLE, color: 'var(--status-error)' }}>
          {model.inlineError}
        </p>
      )}
      {model.queued && !model.inlineError && (
        <p
          role="status"
          style={{ fontSize: '12px', color: 'var(--status-success)', marginTop: '6px' }}
          data-testid="queued-confirmation"
        >
          Queued locally — will dispatch on reconnect.
        </p>
      )}
    </>
  );
}

function DispatchFormFields({
  model,
  projectRoots,
}: DispatchFormViewProps): React.ReactElement {
  return (
    <>
      <TitleField id={`${model.id}-title`} value={model.state.title} onChange={(v) => model.set('title', v)} />
      <PromptField
        id={`${model.id}-prompt`}
        value={model.state.prompt}
        onChange={(v) => model.set('prompt', v)}
      />
      <ProjectField
        id={`${model.id}-project`}
        roots={projectRoots}
        value={model.state.projectPath}
        onChange={(v) => model.set('projectPath', v)}
      />
      <WorktreeFields
        enabled={model.state.worktreeEnabled}
        name={model.state.worktreeName}
        onToggle={(v) => model.set('worktreeEnabled', v)}
        onNameChange={(v) => model.set('worktreeName', v)}
      />
      <SubmitArea submitting={model.submitting} isOffline={model.isOffline} onCancelSubmit={model.cancelSubmit} />
    </>
  );
}

export function DispatchFormView({ model, projectRoots }: DispatchFormViewProps): React.ReactElement {
  return (
    <form onSubmit={model.handleSubmit} style={SCROLLABLE_BODY_STYLE} data-testid="dispatch-form">
      <DispatchFormStatusMessages model={model} />
      <DispatchFormFields model={model} projectRoots={projectRoots} />
    </form>
  );
}
