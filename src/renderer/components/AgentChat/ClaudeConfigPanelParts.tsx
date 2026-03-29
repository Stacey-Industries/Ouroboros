import React, { useRef, useState } from 'react';

import type { CommandDefinition } from '../../../shared/types/claudeConfig';

// ── Types ───────────────────────────────────────────────────────────────────

export type ConfigTabId = 'commands' | 'rules' | 'hooks' | 'settings';

export type ScopeValue = 'global' | 'project';

// ── Tab data ────────────────────────────────────────────────────────────────

const CONFIG_TABS: { id: ConfigTabId; label: string }[] = [
  { id: 'commands', label: 'Commands' },
  { id: 'rules', label: 'Rules' },
  { id: 'hooks', label: 'Hooks' },
  { id: 'settings', label: 'Settings' },
];

// ── ConfigTabBar ────────────────────────────────────────────────────────────

function TabButton({
  tab,
  isActive,
  onClick,
}: {
  tab: { id: ConfigTabId; label: string };
  isActive: boolean;
  onClick: () => void;
}): React.ReactElement<any> {
  return (
    <button
      role="tab"
      aria-selected={isActive}
      className={
        'px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider transition-colors duration-75 '
        + (isActive ? 'text-text-semantic-primary' : 'text-text-semantic-muted hover:text-text-semantic-primary')
      }
      style={{
        borderBottom: isActive ? '2px solid var(--interactive-accent)' : '2px solid transparent',
      }}
      onClick={onClick}
    >
      {tab.label}
    </button>
  );
}

export function ConfigTabBar({
  activeTab,
  onTabChange,
}: {
  activeTab: ConfigTabId;
  onTabChange: (tab: ConfigTabId) => void;
}): React.ReactElement<any> {
  return (
    <div className="border-b border-border-semantic bg-surface-panel flex-shrink-0 flex">
      {CONFIG_TABS.map((tab) => (
        <TabButton
          key={tab.id}
          tab={tab}
          isActive={activeTab === tab.id}
          onClick={() => onTabChange(tab.id)}
        />
      ))}
    </div>
  );
}

// ── ScopeToggle ─────────────────────────────────────────────────────────────

function ScopeButton({
  label,
  isActive,
  onClick,
}: {
  label: string;
  isActive: boolean;
  onClick: () => void;
}): React.ReactElement<any> {
  return (
    <button
      className={
        'text-[10px] px-2 py-0.5 rounded transition-colors duration-75 '
        + (isActive
          ? 'bg-interactive-muted text-text-semantic-primary'
          : 'text-text-semantic-muted hover:text-text-semantic-primary')
      }
      onClick={onClick}
    >
      {label}
    </button>
  );
}

export function ScopeToggle({
  scope,
  onScopeChange,
}: {
  scope: ScopeValue;
  onScopeChange: (s: ScopeValue) => void;
}): React.ReactElement<any> {
  return (
    <div className="flex gap-1 px-3 py-1.5">
      <ScopeButton label="Global" isActive={scope === 'global'} onClick={() => onScopeChange('global')} />
      <ScopeButton label="Project" isActive={scope === 'project'} onClick={() => onScopeChange('project')} />
    </div>
  );
}

// ── CommandItem ──────────────────────────────────────────────────────────────

const SCOPE_BADGE: Record<string, string> = { user: '\u25C8', project: '\u25A3' };

function CommandActionButtons({
  filePath,
  id,
  scope,
  onOpen,
  onDelete,
}: {
  filePath: string;
  id: string;
  scope: string;
  onOpen: (filePath: string) => void;
  onDelete: (id: string, scope: string) => void;
}): React.ReactElement<any> {
  return (
    <span className="flex items-center gap-1 ml-auto flex-shrink-0">
      <button
        className="text-[10px] text-interactive-accent px-1.5 py-0.5 rounded transition-colors duration-75"
        onClick={() => onOpen(filePath)}
        onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.75'; }}
        onMouseLeave={(e) => { e.currentTarget.style.opacity = '1'; }}
      >
        Open
      </button>
      <button
        className="text-[10px] text-status-error px-1 py-0.5 rounded transition-colors duration-75 opacity-0 group-hover:opacity-100"
        onClick={() => onDelete(id, scope)}
      >
        Delete
      </button>
    </span>
  );
}

export function CommandItem({
  command,
  onOpen,
  onDelete,
}: {
  command: CommandDefinition;
  onOpen: (filePath: string) => void;
  onDelete: (id: string, scope: string) => void;
}): React.ReactElement<any> {
  return (
    <div
      className="group flex items-center gap-2 w-full px-3 py-1.5 transition-colors duration-75"
      style={{ backgroundColor: 'transparent' }}
      onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--surface-raised)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
    >
      <span className="text-[10px] text-text-semantic-muted flex-shrink-0" title={command.scope}>
        {SCOPE_BADGE[command.scope] ?? '?'}
      </span>
      <span className="flex flex-col min-w-0 flex-1">
        <span className="text-xs font-medium text-text-semantic-primary truncate">
          {command.name}
        </span>
        {command.description && (
          <span className="text-[10px] text-text-semantic-muted truncate">{command.description}</span>
        )}
      </span>
      <CommandActionButtons
        filePath={command.filePath}
        id={command.id}
        scope={command.scope}
        onOpen={onOpen}
        onDelete={onDelete}
      />
    </div>
  );
}

// ── InlineCreateForm ────────────────────────────────────────────────────────

const NAME_RE = /^[a-z][a-z0-9-]*$/;

function validateName(name: string): string | null {
  if (!name) return 'Name is required';
  if (!NAME_RE.test(name)) return 'Lowercase, hyphens, no spaces';
  return null;
}

function CreateTrigger({ onOpen, placeholder }: { onOpen: () => void; placeholder?: string }): React.ReactElement<any> {
  return (
    <button
      className="text-[10px] text-text-semantic-muted transition-colors duration-75"
      onClick={onOpen}
      onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--interactive-accent)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.color = ''; }}
    >
      {placeholder ?? '+ New'}
    </button>
  );
}

interface CreateFormProps {
  inputRef: React.RefObject<HTMLInputElement | null>;
  name: string;
  error: string | null;
  onNameChange: (value: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  onCancel: () => void;
}

function CreateForm({ inputRef, name, error, onNameChange, onSubmit, onKeyDown, onCancel }: CreateFormProps): React.ReactElement<any> {
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-1">
      <div className="flex items-center gap-1.5">
        <input
          ref={inputRef}
          type="text"
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="my-item-name"
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

function useCreateFormHandlers(onCreate: (name: string) => void): {
  open: boolean; name: string; error: string | null;
  inputRef: React.RefObject<HTMLInputElement | null>;
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
    const err = validateName(trimmed);
    if (err) { setError(err); return; }
    onCreate(trimmed);
    handleClose();
  };
  const handleKeyDown = (e: React.KeyboardEvent) => { if (e.key === 'Escape') handleClose(); };
  return { open, name, error, inputRef, handleOpen, handleClose, handleNameChange, handleSubmit, handleKeyDown };
}

export function InlineCreateForm({
  onCreate,
  placeholder,
}: {
  onCreate: (name: string) => void;
  placeholder?: string;
}): React.ReactElement<any> {
  const h = useCreateFormHandlers(onCreate);
  return (
    <div className="px-3 py-1.5">
      {!h.open
        ? <CreateTrigger onOpen={h.handleOpen} placeholder={placeholder} />
        : <CreateForm inputRef={h.inputRef} name={h.name} error={h.error} onNameChange={h.handleNameChange} onSubmit={h.handleSubmit} onKeyDown={h.handleKeyDown} onCancel={h.handleClose} />}
    </div>
  );
}
