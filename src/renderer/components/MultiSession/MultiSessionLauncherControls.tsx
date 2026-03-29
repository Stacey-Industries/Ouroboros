import React from 'react';

import type { AgentTemplate } from '../../types/electron';
import {
  EFFORT_OPTIONS,
  MODEL_OPTIONS,
  OVERRIDE_SELECT_STYLE,
  PROMPT_STYLE,
  TEMPLATE_SELECT_STYLE,
} from './MultiSessionLauncherControls.styles';
import type { SessionSlot } from './useMultiSessionLauncherModel';
import { MAX_SLOTS } from './useMultiSessionLauncherModel';

interface IconButtonProps {
  ariaLabel: string;
  children: React.ReactNode;
  defaultColor: string;
  hoverColor: string;
  onClick: () => void;
  title: string;
}

export function IconButton({
  ariaLabel,
  children,
  defaultColor,
  hoverColor,
  onClick,
  title,
}: IconButtonProps): React.ReactElement<any> {
  return (
    <button
      onClick={onClick}
      className="shrink-0 rounded p-1 transition-colors"
      style={{ color: defaultColor, background: 'transparent', border: 'none', cursor: 'pointer' }}
      onMouseEnter={(event) => {
        event.currentTarget.style.color = hoverColor;
      }}
      onMouseLeave={(event) => {
        event.currentTarget.style.color = defaultColor;
      }}
      title={title}
      aria-label={ariaLabel}
    >
      {children}
    </button>
  );
}

export function MultiSessionGridIcon(): React.ReactElement<any> {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden="true"
      className="text-interactive-accent"
      style={{ flexShrink: 0 }}
    >
      <rect x="1" y="1" width="5" height="6" rx="1" />
      <rect x="10" y="1" width="5" height="6" rx="1" />
      <rect x="1" y="9" width="5" height="6" rx="1" />
      <rect x="10" y="9" width="5" height="6" rx="1" />
    </svg>
  );
}

export function CloseIcon(): React.ReactElement<any> {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path
        d="M2.5 2.5L9.5 9.5M9.5 2.5L2.5 9.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function SessionTemplateSelect({
  index,
  slot,
  templates,
  onUpdate,
}: {
  index: number;
  slot: SessionSlot;
  templates: AgentTemplate[];
  onUpdate: (id: string, updates: Partial<SessionSlot>) => void;
}): React.ReactElement<any> {
  return (
    <select
      value={slot.templateId}
      onChange={(event) => onUpdate(slot.id, { templateId: event.target.value })}
      style={TEMPLATE_SELECT_STYLE}
      className="text-text-semantic-primary"
      aria-label={`Template for session ${index + 1}`}
    >
      <option value="__custom__">Custom prompt</option>
      {templates.map((template) => (
        <option key={template.id} value={template.id}>
          {template.icon ? `${template.icon} ` : ''}
          {template.name}
        </option>
      ))}
    </select>
  );
}

function OverrideSelect({
  ariaLabel,
  options,
  value,
  onChange,
}: {
  ariaLabel: string;
  options: Array<{ label: string; value: string }>;
  value: string;
  onChange: (value: string) => void;
}): React.ReactElement<any> {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      style={OVERRIDE_SELECT_STYLE}
      className="text-text-semantic-primary"
      aria-label={ariaLabel}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

export function SlotEditorHeader({
  canRemove,
  index,
  onRemove,
  onUpdate,
  slot,
  templates,
}: {
  canRemove: boolean;
  index: number;
  onRemove: (id: string) => void;
  onUpdate: (id: string, updates: Partial<SessionSlot>) => void;
  slot: SessionSlot;
  templates: AgentTemplate[];
}): React.ReactElement<any> {
  return (
    <div className="flex items-center gap-2">
      <span className="shrink-0 text-[11px] font-semibold text-interactive-accent">
        Session {index + 1}
      </span>
      <SessionTemplateSelect index={index} onUpdate={onUpdate} slot={slot} templates={templates} />
      {canRemove ? (
        <IconButton
          ariaLabel={`Remove session ${index + 1}`}
          defaultColor="var(--text-faint)"
          hoverColor="var(--status-error)"
          onClick={() => onRemove(slot.id)}
          title="Remove session"
        >
          <CloseIcon />
        </IconButton>
      ) : null}
    </div>
  );
}

export function SlotPromptField({
  index,
  onUpdate,
  slot,
}: {
  index: number;
  onUpdate: (id: string, updates: Partial<SessionSlot>) => void;
  slot: SessionSlot;
}): React.ReactElement<any> {
  return (
    <textarea
      value={slot.customPrompt}
      onChange={(event) => onUpdate(slot.id, { customPrompt: event.target.value })}
      placeholder="Enter a prompt for this session..."
      rows={2}
      style={PROMPT_STYLE}
      className="text-text-semantic-primary"
      aria-label={`Custom prompt for session ${index + 1}`}
    />
  );
}

export function SlotOverrides({
  index,
  onUpdate,
  slot,
}: {
  index: number;
  onUpdate: (id: string, updates: Partial<SessionSlot>) => void;
  slot: SessionSlot;
}): React.ReactElement<any> {
  return (
    <div className="flex items-center gap-2">
      <span className="shrink-0 text-[10px] text-text-semantic-faint">Overrides:</span>
      <OverrideSelect
        ariaLabel={`Model override for session ${index + 1}`}
        options={MODEL_OPTIONS}
        value={slot.modelOverride}
        onChange={(value) => onUpdate(slot.id, { modelOverride: value })}
      />
      <OverrideSelect
        ariaLabel={`Effort override for session ${index + 1}`}
        options={EFFORT_OPTIONS}
        value={slot.effortOverride}
        onChange={(value) => onUpdate(slot.id, { effortOverride: value })}
      />
    </div>
  );
}

function updateAddButtonColors(
  button: HTMLButtonElement,
  canAddSlot: boolean,
  hover: boolean,
): void {
  button.style.borderColor =
    hover && canAddSlot ? 'var(--interactive-accent)' : 'var(--border-default)';
  button.style.color =
    hover && canAddSlot
      ? 'var(--text-primary)'
      : canAddSlot
        ? 'var(--text-muted)'
        : 'var(--text-faint)';
}

export function AddSessionButton({
  canAddSlot,
  onAddSlot,
}: {
  canAddSlot: boolean;
  onAddSlot: () => void;
}): React.ReactElement<any> {
  return (
    <button
      onClick={onAddSlot}
      disabled={!canAddSlot}
      className="flex items-center gap-1 rounded px-2.5 py-1.5 text-[11px] font-medium transition-colors"
      style={{
        background: 'transparent',
        border: '1px solid var(--border-default)',
        color: canAddSlot ? 'var(--text-muted)' : 'var(--text-faint)',
        cursor: canAddSlot ? 'pointer' : 'not-allowed',
        fontFamily: 'var(--font-ui)',
        opacity: canAddSlot ? 1 : 0.5,
      }}
      onMouseEnter={(event) => updateAddButtonColors(event.currentTarget, canAddSlot, true)}
      onMouseLeave={(event) => updateAddButtonColors(event.currentTarget, canAddSlot, false)}
      title={canAddSlot ? 'Add another session slot' : `Maximum ${MAX_SLOTS} sessions`}
    >
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
        <path d="M5 1v8M1 5h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
      Add Session
    </button>
  );
}

export function SlotCounter({ slotsLength }: { slotsLength: number }): React.ReactElement<any> {
  return (
    <span className="text-[10px] tabular-nums text-text-semantic-faint">
      {slotsLength} / {MAX_SLOTS}
    </span>
  );
}

export function LaunchAllButton({
  canLaunch,
  onLaunchAll,
}: {
  canLaunch: boolean;
  onLaunchAll: () => void;
}): React.ReactElement<any> {
  return (
    <button
      onClick={onLaunchAll}
      disabled={!canLaunch}
      className="flex items-center gap-1.5 rounded px-3 py-1.5 text-[11px] font-semibold transition-colors"
      style={{
        background: canLaunch ? 'var(--interactive-accent)' : 'var(--surface-raised)',
        color: canLaunch ? 'var(--text-on-accent)' : 'var(--text-faint)',
        border: 'none',
        cursor: canLaunch ? 'pointer' : 'not-allowed',
        fontFamily: 'var(--font-ui)',
      }}
      title={
        canLaunch
          ? 'Launch all configured sessions simultaneously'
          : 'Configure at least one session with a prompt'
      }
    >
      <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor" aria-hidden="true">
        <path d="M2 1l7 4-7 4V1z" />
      </svg>
      Launch All
    </button>
  );
}
