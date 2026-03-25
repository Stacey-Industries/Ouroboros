import React, { useRef, useState } from 'react';

import type { RulesFile, SkillDefinition } from '../../../shared/types/rulesAndSkills';

// ── SectionHeader ─────────────────────────────────────────────────────────────

export function SectionHeader({ label }: { label: string }): React.ReactElement {
  return (
    <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-text-semantic-muted select-none">
      {label}
    </div>
  );
}

// ── RuleItem ──────────────────────────────────────────────────────────────────

const RULE_LABELS: Record<'claude-md' | 'agents-md', string> = {
  'claude-md': 'CLAUDE.md',
  'agents-md': 'AGENTS.md',
};

function RuleOpenButton({ filePath, onOpen }: { filePath: string; onOpen: (path: string) => void }): React.ReactElement {
  return (
    <button
      className="text-[10px] text-interactive-accent px-1.5 py-0.5 rounded transition-colors duration-75"
      onClick={() => onOpen(filePath)}
      onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.75'; }}
      onMouseLeave={(e) => { e.currentTarget.style.opacity = '1'; }}
    >
      Open
    </button>
  );
}

function RuleCreateButton({
  type,
  onCreate,
}: {
  type: 'claude-md' | 'agents-md';
  onCreate: (type: 'claude-md' | 'agents-md') => void;
}): React.ReactElement {
  return (
    <button
      className="text-[10px] text-text-semantic-muted px-1.5 py-0.5 rounded transition-colors duration-75"
      onClick={() => onCreate(type)}
      onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--interactive-accent)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.color = ''; }}
    >
      Create
    </button>
  );
}

export function RuleItem({
  rule,
  onOpen,
  onCreate,
}: {
  rule: RulesFile;
  onOpen: (path: string) => void;
  onCreate: (type: 'claude-md' | 'agents-md') => void;
}): React.ReactElement {
  return (
    <div
      className="flex items-center gap-2 w-full px-3 py-1.5 transition-colors duration-75"
      style={{ backgroundColor: 'transparent' }}
      onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--surface-raised)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
    >
      <span
        className="inline-block h-1.5 w-1.5 flex-shrink-0 rounded-full"
        style={{ backgroundColor: rule.exists ? 'var(--status-success)' : 'var(--text-semantic-muted)' }}
        aria-label={rule.exists ? 'exists' : 'missing'}
      />
      <span className="flex-1 text-xs text-text-semantic-primary truncate">
        {RULE_LABELS[rule.type]}
      </span>
      {rule.exists
        ? <RuleOpenButton filePath={rule.filePath} onOpen={onOpen} />
        : <RuleCreateButton type={rule.type} onCreate={onCreate} />}
    </div>
  );
}

// ── SkillItem ─────────────────────────────────────────────────────────────────

function LightningIcon(): React.ReactElement {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden="true"
      className="flex-shrink-0 text-text-semantic-muted"
    >
      <path d="M11.251.068a.5.5 0 0 1 .227.58L9.677 6.5H13a.5.5 0 0 1 .364.843l-8 8.5a.5.5 0 0 1-.842-.49L6.323 9.5H3a.5.5 0 0 1-.364-.843l8-8.5a.5.5 0 0 1 .615-.09z" />
    </svg>
  );
}

export function SkillItem({
  skill,
  onOpen,
}: {
  skill: SkillDefinition;
  onOpen: (path: string) => void;
}): React.ReactElement {
  return (
    <button
      className="flex items-start gap-2 w-full px-3 py-1.5 text-left transition-colors duration-75"
      style={{ backgroundColor: 'transparent' }}
      onClick={() => onOpen(skill.filePath)}
      onMouseEnter={(e) => {
        e.currentTarget.style.backgroundColor = 'var(--surface-raised)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = 'transparent';
      }}
    >
      <span className="mt-0.5">
        <LightningIcon />
      </span>
      <span className="flex flex-col min-w-0">
        <span className="text-xs font-medium text-text-semantic-primary truncate">{skill.name}</span>
        {skill.description && (
          <span className="text-[10px] text-text-semantic-muted truncate">{skill.description}</span>
        )}
      </span>
    </button>
  );
}

// ── CreateSkillInline ─────────────────────────────────────────────────────────

const SKILL_NAME_RE = /^[a-z][a-z0-9-]*$/;

function validateSkillName(name: string): string | null {
  if (!name) return 'Name is required';
  if (!SKILL_NAME_RE.test(name)) return 'Lowercase, hyphens, no spaces';
  return null;
}

function CreateSkillTrigger({ onOpen }: { onOpen: () => void }): React.ReactElement {
  return (
    <button
      className="text-[10px] text-text-semantic-muted transition-colors duration-75"
      onClick={onOpen}
      onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--interactive-accent)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.color = ''; }}
    >
      + New Skill
    </button>
  );
}

interface CreateSkillFormProps {
  inputRef: React.RefObject<HTMLInputElement>;
  name: string;
  error: string | null;
  onNameChange: (value: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  onCancel: () => void;
}

function CreateSkillForm({ inputRef, name, error, onNameChange, onSubmit, onKeyDown, onCancel }: CreateSkillFormProps): React.ReactElement {
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-1">
      <div className="flex items-center gap-1.5">
        <input
          ref={inputRef}
          type="text"
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="my-skill-name"
          className="flex-1 bg-surface-inset text-xs text-text-semantic-primary px-2 py-0.5 rounded border border-border-semantic outline-none min-w-0"
        />
        <button type="submit" className="text-[10px] text-interactive-accent px-1.5 py-0.5 rounded border border-border-semantic transition-colors duration-75">
          Create
        </button>
        <button type="button" className="text-[10px] text-text-semantic-muted px-1 py-0.5" onClick={onCancel}>
          ✕
        </button>
      </div>
      {error && <span className="text-[10px] text-status-error">{error}</span>}
    </form>
  );
}

function useCreateSkillHandlers(onCreate: (name: string) => void): {
  open: boolean; name: string; error: string | null;
  inputRef: React.RefObject<HTMLInputElement>;
  handleOpen: () => void; handleClose: () => void;
  handleNameChange: (v: string) => void;
  handleSubmit: (e: React.FormEvent) => void;
  handleKeyDown: (e: React.KeyboardEvent) => void;
} {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const reset = () => { setName(''); setError(null); };
  const handleClose = () => { setOpen(false); reset(); };
  const handleOpen = () => { setOpen(true); reset(); setTimeout(() => inputRef.current?.focus(), 0); };
  const handleNameChange = (v: string) => { setName(v); setError(null); };
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    const err = validateSkillName(trimmed);
    if (err) { setError(err); return; }
    onCreate(trimmed);
    handleClose();
  };
  const handleKeyDown = (e: React.KeyboardEvent) => { if (e.key === 'Escape') handleClose(); };
  return { open, name, error, inputRef, handleOpen, handleClose, handleNameChange, handleSubmit, handleKeyDown };
}

export function CreateSkillInline({ onCreate }: { onCreate: (name: string) => void }): React.ReactElement {
  const { open, name, error, inputRef, handleOpen, handleClose, handleNameChange, handleSubmit, handleKeyDown } =
    useCreateSkillHandlers(onCreate);
  return (
    <div className="px-3 py-1.5">
      {!open
        ? <CreateSkillTrigger onOpen={handleOpen} />
        : <CreateSkillForm inputRef={inputRef} name={name} error={error} onNameChange={handleNameChange} onSubmit={handleSubmit} onKeyDown={handleKeyDown} onCancel={handleClose} />}
    </div>
  );
}
