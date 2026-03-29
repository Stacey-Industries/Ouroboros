import React from 'react';

import type { OrchestrationMode, OrchestrationProvider, VerificationProfileName } from '../../types/electron';
import { ActionButton, cardStyle } from '../ContextBuilder/ContextBuilderPrimitives';
import { panelStyle } from './orchestrationUi';
import type { OrchestrationTaskComposerModel } from './useOrchestrationTaskComposerModel';

const FIELD_GRID_STYLE: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
  gap: '12px',
};

const FIELD_STACK_STYLE: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '6px',
};

const LABEL_STYLE: React.CSSProperties = {
  fontSize: '12px',
  fontWeight: 600,
  color: 'var(--text)',
};

const INPUT_STYLE: React.CSSProperties = {
  width: '100%',
  borderRadius: '8px',
  border: '1px solid var(--border)',
  background: 'var(--bg)',
  color: 'var(--text)',
  padding: '10px 12px',
  fontSize: '13px',
  fontFamily: 'var(--font-ui)',
  boxSizing: 'border-box',
};

const TEXTAREA_STYLE: React.CSSProperties = {
  ...INPUT_STYLE,
  minHeight: '92px',
  resize: 'vertical',
  lineHeight: 1.5,
};

const ACTION_ROW_STYLE: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: '8px',
  marginTop: '16px',
};

const STATUS_STYLE: React.CSSProperties = {
  fontSize: '12px',
  color: 'var(--text-muted)',
};

const ERROR_STYLE: React.CSSProperties = {
  ...cardStyle,
  ...panelStyle('color-mix(in srgb, #ef4444 8%, var(--bg))'),
  marginTop: '12px',
  marginBottom: 0,
  color: '#ef4444',
  borderColor: 'color-mix(in srgb, #ef4444 24%, var(--border))',
};

const MODE_OPTIONS: Array<{ label: string; value: OrchestrationMode }> = [
  { label: 'Edit', value: 'edit' },
  { label: 'Plan', value: 'plan' },
  { label: 'Review', value: 'review' },
];

const PROVIDER_OPTIONS: Array<{ label: string; value: OrchestrationProvider }> = [
  { label: 'Claude Code', value: 'claude-code' },
  { label: 'Codex', value: 'codex' },
];

const PROFILE_OPTIONS: Array<{ label: string; value: VerificationProfileName }> = [
  { label: 'Default', value: 'default' },
  { label: 'Fast', value: 'fast' },
  { label: 'Full', value: 'full' },
];

export function TaskComposerCard({ model }: { model: OrchestrationTaskComposerModel }): React.ReactElement<any> {
  return (
    <div className="rounded-lg border p-4" style={panelStyle()}>
      <TaskComposerHeader projectRootLabel={model.projectRootLabel} />
      <TaskComposerGoalField goal={model.goal} onChange={model.setGoal} />
      <TaskComposerConfigFields model={model} />
      <TaskComposerActions model={model} />
      <TaskComposerMessages error={model.error} status={model.status} />
    </div>
  );
}

function TaskComposerHeader({ projectRootLabel }: { projectRootLabel: string }): React.ReactElement<any> {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <div className="text-[14px] font-semibold" style={{ color: 'var(--text)' }}>New orchestration task</div>
        <div className="mt-1 text-[12px]" style={{ color: 'var(--text-muted)' }}>
          Build context, adjust included files, then launch the provider-backed task.
        </div>
      </div>
      <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{projectRootLabel}</span>
    </div>
  );
}

function TaskComposerGoalField(props: { goal: string; onChange: (value: string) => void }): React.ReactElement<any> {
  return (
    <div className="mt-4" style={FIELD_STACK_STYLE}>
      <label style={LABEL_STYLE} htmlFor="orchestration-goal">Goal</label>
      <textarea
        id="orchestration-goal"
        value={props.goal}
        onChange={(event) => props.onChange(event.target.value)}
        placeholder="Describe the task you want the orchestration loop to carry out..."
        style={TEXTAREA_STYLE}
      />
    </div>
  );
}

function TaskComposerConfigFields({ model }: { model: OrchestrationTaskComposerModel }): React.ReactElement<any> {
  return (
    <div className="mt-4" style={FIELD_GRID_STYLE}>
      <TaskComposerSelectField<OrchestrationMode>
        fieldId="orchestration-mode"
        label="Mode"
        options={MODE_OPTIONS}
        value={model.mode}
        onChange={model.setMode}
      />
      <TaskComposerSelectField<OrchestrationProvider>
        fieldId="orchestration-provider"
        label="Provider"
        options={PROVIDER_OPTIONS}
        value={model.provider}
        onChange={model.setProvider}
      />
      <TaskComposerSelectField<VerificationProfileName>
        fieldId="orchestration-profile"
        label="Verification profile"
        options={PROFILE_OPTIONS}
        value={model.verificationProfile}
        onChange={model.setVerificationProfile}
      />
    </div>
  );
}

function TaskComposerSelectField<T extends string>(props: {
  fieldId: string;
  label: string;
  onChange: (value: T) => void;
  options: Array<{ label: string; value: T }>;
  value: T;
}): React.ReactElement<any> {
  return (
    <label style={FIELD_STACK_STYLE} htmlFor={props.fieldId}>
      <span style={LABEL_STYLE}>{props.label}</span>
      <select
        id={props.fieldId}
        value={props.value}
        onChange={(event) => props.onChange(event.target.value as T)}
        style={INPUT_STYLE}
      >
        {props.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>
  );
}

function TaskComposerActions({ model }: { model: OrchestrationTaskComposerModel }): React.ReactElement<any> {
  return (
    <div style={ACTION_ROW_STYLE}>
      <ActionButton label={model.previewing ? 'Previewing…' : 'Preview Context'} onClick={() => { void model.handlePreview(); }} disabled={!model.canSubmit} />
      <ActionButton label={model.starting ? 'Starting…' : 'Start Task'} onClick={() => { void model.handleStart(); }} disabled={!model.canSubmit} primary />
    </div>
  );
}

function TaskComposerMessages({ error, status }: { error: string | null; status: string | null }): React.ReactElement<any> {
  return (
    <>
      {status ? <div style={STATUS_STYLE}>{status}</div> : null}
      {error ? <div style={ERROR_STYLE}>{error}</div> : null}
    </>
  );
}
