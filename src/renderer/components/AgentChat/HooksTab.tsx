/**
 * HooksTab.tsx — Hook management embedded in the Claude Config panel.
 *
 * Follows the independent IPC pattern (own state, direct IPC calls, reload on scope change).
 */

import React, { useCallback, useEffect, useState } from 'react';

import type { HooksConfig } from '../../../shared/types/rulesAndSkills';
import { ScopeToggle, type ScopeValue } from './ClaudeConfigPanelParts';

// ── Constants ────────────────────────────────────────────────────────────────

const HOOK_EVENT_TYPES = [
  'PreToolUse',
  'PostToolUse',
  'SubagentStart',
  'SubagentStop',
  'SessionStart',
  'Stop',
] as const;

// ── API guard ────────────────────────────────────────────────────────────────

function hasAPI(): boolean {
  return (
    typeof window !== 'undefined'
    && 'electronAPI' in window
    && 'rulesAndSkills' in window.electronAPI
  );
}

// ── AddHookForm ──────────────────────────────────────────────────────────────

function AddHookToggle({ onClick }: { onClick: () => void }): React.ReactElement<any> {
  return (
    <button
      className="text-[10px] text-text-semantic-muted mt-1 transition-colors duration-75"
      onClick={onClick}
      onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--interactive-accent)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.color = ''; }}
    >
      + Add Hook
    </button>
  );
}

const INPUT_CLS = 'bg-surface-inset text-[11px] text-text-semantic-primary font-mono px-2 py-0.5 rounded border border-border-semantic outline-none';

function AddHookFormFields(props: {
  command: string; matcher: string;
  setCommand: (v: string) => void; setMatcher: (v: string) => void;
  onSubmit: () => void; onCancel: () => void;
}): React.ReactElement<any> {
  const handleKey = (e: React.KeyboardEvent): void => {
    if (e.key === 'Enter') { e.preventDefault(); props.onSubmit(); }
    if (e.key === 'Escape') props.onCancel();
  };
  return (
    <div className="flex flex-col gap-1 mt-1">
      <input type="text" value={props.command} onChange={(e) => props.setCommand(e.target.value)} onKeyDown={handleKey} placeholder="Shell command..." className={INPUT_CLS} autoFocus />
      <input type="text" value={props.matcher} onChange={(e) => props.setMatcher(e.target.value)} onKeyDown={handleKey} placeholder="Matcher (optional)..." className={INPUT_CLS} />
      <div className="flex gap-1">
        <button className="text-[10px] text-interactive-accent px-1.5 py-0.5 rounded border border-border-semantic transition-colors duration-75" onClick={props.onSubmit} disabled={!props.command.trim()}>Add</button>
        <button className="text-[10px] text-text-semantic-muted px-1 py-0.5" onClick={props.onCancel}>Cancel</button>
      </div>
    </div>
  );
}

function AddHookForm({ onAdd }: { onAdd: (command: string, matcher?: string) => void }): React.ReactElement<any> {
  const [command, setCommand] = useState('');
  const [matcher, setMatcher] = useState('');
  const [open, setOpen] = useState(false);

  function handleSubmit(): void {
    const cmd = command.trim();
    if (!cmd) return;
    onAdd(cmd, matcher.trim() || undefined);
    setCommand('');
    setMatcher('');
    setOpen(false);
  }

  if (!open) return <AddHookToggle onClick={() => setOpen(true)} />;

  return (
    <AddHookFormFields
      command={command} matcher={matcher}
      setCommand={setCommand} setMatcher={setMatcher}
      onSubmit={handleSubmit} onCancel={() => setOpen(false)}
    />
  );
}

// ── HookEntryRow ─────────────────────────────────────────────────────────────

function HookEntryRow({
  command,
  matcherLabel,
  onRemove,
}: {
  command: string;
  matcherLabel?: string;
  onRemove: () => void;
}): React.ReactElement<any> {
  return (
    <div className="group flex items-center gap-2 py-0.5">
      <span className="flex-1 text-[11px] font-mono text-text-semantic-secondary truncate">
        {command}
      </span>
      {matcherLabel && (
        <span className="text-[9px] text-text-semantic-muted px-1 py-px rounded bg-surface-inset">
          {matcherLabel}
        </span>
      )}
      <button
        className="text-[10px] text-text-semantic-muted opacity-0 group-hover:opacity-100 transition-opacity duration-75 px-1"
        onClick={onRemove}
        aria-label="Remove hook"
      >
        x
      </button>
    </div>
  );
}

// ── EventTypeSection ─────────────────────────────────────────────────────────

function EventTypeSectionBody({
  entries, hookCount, eventType, onAdd, onRemove,
}: {
  entries: HooksConfig[string]; hookCount: number; eventType: string;
  onAdd: (eventType: string, command: string, matcher?: string) => void;
  onRemove: (eventType: string, index: number) => void;
}): React.ReactElement<any> {
  return (
    <div className="px-2 py-1 bg-surface-base border-t border-border-semantic">
      {hookCount === 0 ? (
        <p className="text-[10px] text-text-semantic-muted py-0.5">No hooks registered.</p>
      ) : (
        entries.flatMap((matcher, mi) =>
          (matcher.hooks ?? []).map((hook, hi) => (
            <HookEntryRow key={`${mi}-${hi}`} command={hook.command} matcherLabel={matcher.matcher} onRemove={() => onRemove(eventType, mi)} />
          )),
        )
      )}
      <AddHookForm onAdd={(cmd, m) => onAdd(eventType, cmd, m)} />
    </div>
  );
}

function EventTypeSection({
  eventType, matchers, onAdd, onRemove,
}: {
  eventType: string;
  matchers: HooksConfig[string] | undefined;
  onAdd: (eventType: string, command: string, matcher?: string) => void;
  onRemove: (eventType: string, index: number) => void;
}): React.ReactElement<any> {
  const [isOpen, setIsOpen] = useState(false);
  const entries = matchers ?? [];
  const hookCount = entries.reduce((sum, m) => sum + (m.hooks?.length ?? 0), 0);

  return (
    <div className="border border-border-semantic rounded mb-1 overflow-hidden">
      <button
        className="w-full flex items-center px-2 py-1 text-[11px] font-medium text-text-semantic-primary bg-surface-raised"
        onClick={() => setIsOpen((v) => !v)}
        aria-expanded={isOpen}
      >
        <span className="flex-1 text-left">{eventType}</span>
        <span className="text-[10px] text-text-semantic-muted mr-1">{hookCount}</span>
        <span className="text-[9px]">{isOpen ? '\u25B2' : '\u25BC'}</span>
      </button>
      {isOpen && <EventTypeSectionBody entries={entries} hookCount={hookCount} eventType={eventType} onAdd={onAdd} onRemove={onRemove} />}
    </div>
  );
}

// ── HooksTab (main component) ────────────────────────────────────────────────

export interface HooksTabProps {
  projectRoot: string | null;
}

function useHooksData(scope: ScopeValue, projectRoot: string | null) {
  const [hooks, setHooks] = useState<HooksConfig>({});
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async (): Promise<void> => {
    if (!hasAPI()) return;
    setLoading(true);
    try {
      const result = await window.electronAPI.rulesAndSkills.getHooksConfig(scope, projectRoot ?? undefined);
      setHooks(result.success && result.hooks ? result.hooks : {});
    } finally {
      setLoading(false);
    }
  }, [scope, projectRoot]);

  useEffect(() => { void reload(); }, [reload]);

  const handleAdd = useCallback(
    async (eventType: string, command: string, matcher?: string): Promise<void> => {
      if (!hasAPI()) return;
      await window.electronAPI.rulesAndSkills.addHook({ scope, eventType, command, matcher, projectRoot: projectRoot ?? undefined });
      await reload();
    },
    [scope, projectRoot, reload],
  );

  const handleRemove = useCallback(
    async (eventType: string, index: number): Promise<void> => {
      if (!hasAPI()) return;
      await window.electronAPI.rulesAndSkills.removeHook({ scope, eventType, index, projectRoot: projectRoot ?? undefined });
      await reload();
    },
    [scope, projectRoot, reload],
  );

  return { hooks, loading, handleAdd, handleRemove };
}

function HooksTabBody({ hooks, handleAdd, handleRemove }: {
  hooks: HooksConfig; handleAdd: (et: string, cmd: string, m?: string) => void; handleRemove: (et: string, i: number) => void;
}): React.ReactElement<any> {
  return (
    <>
      <p className="text-[10px] text-text-semantic-muted mb-1.5">
        Shell commands that run at Claude Code lifecycle events.
      </p>
      {HOOK_EVENT_TYPES.map((eventType) => (
        <EventTypeSection key={eventType} eventType={eventType} matchers={hooks[eventType]} onAdd={handleAdd} onRemove={handleRemove} />
      ))}
    </>
  );
}

export function HooksTab({ projectRoot }: HooksTabProps): React.ReactElement<any> {
  const [scope, setScope] = useState<ScopeValue>('global');
  const { hooks, loading, handleAdd, handleRemove } = useHooksData(scope, projectRoot);

  return (
    <div className="flex flex-col gap-0">
      <ScopeToggle scope={scope} onScopeChange={setScope} />
      <div className="px-3 pb-2">
        {loading
          ? <div className="text-[10px] text-text-semantic-muted animate-pulse py-1">Loading hooks...</div>
          : <HooksTabBody hooks={hooks} handleAdd={handleAdd} handleRemove={handleRemove} />}
      </div>
    </div>
  );
}
