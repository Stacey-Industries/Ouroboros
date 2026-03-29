/**
 * HooksConfigSubsection.tsx — Manage .claude/settings.json hooks entries.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';

import { useProject } from '../../contexts/ProjectContext';
import type { HooksConfig } from '../../types/electron';
import { SectionLabel } from './settingsStyles';

const HOOK_EVENT_TYPES = ['PreToolUse', 'PostToolUse', 'SubagentStart', 'SubagentStop', 'SessionStart', 'Stop'] as const;
type HookScope = 'global' | 'project';

interface HooksConfigSubsectionProps {
  projectRoot?: string;
}

function hasRulesAndSkillsAPI(): boolean {
  return typeof window !== 'undefined' && 'electronAPI' in window && 'rulesAndSkills' in window.electronAPI;
}

async function fetchHooks(scope: HookScope, projectRoot: string | undefined): Promise<HooksConfig> {
  if (!hasRulesAndSkillsAPI()) return {};
  const result = await window.electronAPI.rulesAndSkills.getHooksConfig(scope, projectRoot);
  return result.success && result.hooks ? result.hooks : {};
}

function ScopeToggle({ scope, onScopeChange }: { scope: HookScope; onScopeChange: (s: HookScope) => void }): React.ReactElement<any> {
  return (
    <div style={scopeToggleStyle}>
      {(['global', 'project'] as const).map((s) => (
        <button key={s} onClick={() => onScopeChange(s)} style={scopeButtonStyle(scope === s)}>
          {s === 'global' ? 'Global' : 'Project'}
        </button>
      ))}
    </div>
  );
}

function AddHookRow({ onAdd }: { onAdd: (command: string) => Promise<void> }): React.ReactElement<any> {
  const [value, setValue] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  async function handleAdd(): Promise<void> {
    const cmd = value.trim();
    if (!cmd) return;
    setIsAdding(true);
    try { await onAdd(cmd); setValue(''); } finally { setIsAdding(false); }
  }

  return (
    <div style={{ display: 'flex', gap: '6px', marginTop: '6px' }}>
      <input
        type="text" value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void handleAdd(); } }}
        placeholder="Shell command..." className="text-text-semantic-primary" style={addInputStyle}
      />
      <button onClick={() => void handleAdd()} disabled={!value.trim() || isAdding} style={addBtnStyle(!value.trim() || isAdding)}>
        Add
      </button>
    </div>
  );
}

interface HookEntriesListProps {
  eventType: string;
  matchers: HooksConfig[string];
  onRemove: (eventType: string, index: number) => Promise<void>;
}

function HookEntriesList({ eventType, matchers, onRemove }: HookEntriesListProps): React.ReactElement<any> {
  if (!matchers.length) {
    return <p className="text-text-semantic-muted" style={{ fontSize: '11px', margin: '4px 0' }}>No hooks registered.</p>;
  }
  let globalIdx = 0;
  return (
    <>
      {matchers.map((matcher, mi) =>
        (matcher.hooks ?? []).map((hook) => {
          const idx = globalIdx++;
          return (
            <div key={`${mi}-${idx}`} style={hookRowStyle}>
              <span className="text-text-semantic-secondary" style={hookCmdStyle}>{hook.command}</span>
              <button onClick={() => void onRemove(eventType, idx)} aria-label="Remove hook" style={removeBtnStyle}>✕</button>
            </div>
          );
        }),
      )}
    </>
  );
}

interface HookEventSectionProps {
  eventType: string;
  hooks: HooksConfig;
  onAdd: (eventType: string, command: string) => Promise<void>;
  onRemove: (eventType: string, index: number) => Promise<void>;
}

function HookEventSection({ eventType, hooks, onAdd, onRemove }: HookEventSectionProps): React.ReactElement<any> {
  const [isOpen, setIsOpen] = useState(false);
  const matchers = hooks[eventType] ?? [];
  const hookCount = matchers.reduce((sum, m) => sum + (m.hooks?.length ?? 0), 0);
  return (
    <div style={eventSectionStyle}>
      <button onClick={() => setIsOpen((v) => !v)} style={eventHeaderStyle} aria-expanded={isOpen}>
        <span style={{ flex: 1, textAlign: 'left' }}>{eventType}</span>
        <span className="text-text-semantic-muted" style={{ fontSize: '11px' }}>{hookCount} hook{hookCount !== 1 ? 's' : ''}</span>
        <span style={{ marginLeft: '8px', fontSize: '10px' }}>{isOpen ? '▲' : '▼'}</span>
      </button>
      {isOpen && (
        <div style={eventBodyStyle}>
          <HookEntriesList eventType={eventType} matchers={matchers} onRemove={onRemove} />
          <AddHookRow onAdd={(cmd) => onAdd(eventType, cmd)} />
        </div>
      )}
    </div>
  );
}

export function HooksConfigSubsection({ projectRoot: projectRootProp }: HooksConfigSubsectionProps): React.ReactElement<any> {
  const { projectRoot: contextRoot } = useProject();
  const projectRoot = projectRootProp ?? contextRoot ?? undefined;
  const [scope, setScope] = useState<HookScope>('global');
  const [hooks, setHooks] = useState<HooksConfig>({});
  const scopeRef = useRef(scope);
  const projectRootRef = useRef(projectRoot);

  useEffect(() => { scopeRef.current = scope; }, [scope]);
  useEffect(() => { projectRootRef.current = projectRoot; }, [projectRoot]);

  const reload = useCallback(async (): Promise<void> => {
    setHooks(await fetchHooks(scopeRef.current, projectRootRef.current));
  }, []);

  useEffect(() => { void reload(); }, [reload, scope, projectRoot]);

  const handleAdd = useCallback(async (eventType: string, command: string): Promise<void> => {
    if (!hasRulesAndSkillsAPI()) return;
    await window.electronAPI.rulesAndSkills.addHook({ scope, eventType, command, projectRoot });
    await reload();
  }, [scope, projectRoot, reload]);

  const handleRemove = useCallback(async (eventType: string, index: number): Promise<void> => {
    if (!hasRulesAndSkillsAPI()) return;
    await window.electronAPI.rulesAndSkills.removeHook({ scope, eventType, index, projectRoot });
    await reload();
  }, [scope, projectRoot, reload]);

  return (
    <section>
      <SectionLabel>Hook Commands</SectionLabel>
      <p className="text-text-semantic-muted" style={{ fontSize: '12px', marginBottom: '12px' }}>
        Register shell commands that run at specific Claude Code lifecycle events.
      </p>
      <ScopeToggle scope={scope} onScopeChange={setScope} />
      <div style={{ marginTop: '12px' }}>
        {HOOK_EVENT_TYPES.map((eventType) => (
          <HookEventSection key={eventType} eventType={eventType} hooks={hooks} onAdd={handleAdd} onRemove={handleRemove} />
        ))}
      </div>
    </section>
  );
}

/* ---------- Styles ---------- */

const scopeToggleStyle: React.CSSProperties = { display: 'inline-flex', borderRadius: '6px', border: '1px solid var(--border-default)', overflow: 'hidden' };
const eventSectionStyle: React.CSSProperties = { borderRadius: '6px', border: '1px solid var(--border-default)', marginBottom: '6px', overflow: 'hidden' };
const eventBodyStyle: React.CSSProperties = { padding: '8px 12px 10px', background: 'var(--surface-base)', borderTop: '1px solid var(--border-default)' };
const hookRowStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 0' };
const hookCmdStyle: React.CSSProperties = { flex: 1, fontSize: '12px', fontFamily: 'var(--font-mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };
const removeBtnStyle: React.CSSProperties = { flexShrink: 0, padding: '2px 6px', borderRadius: '4px', border: '1px solid var(--border-default)', background: 'transparent', color: 'var(--text-muted)', fontSize: '11px', cursor: 'pointer' };
const addInputStyle: React.CSSProperties = { flex: 1, padding: '5px 8px', borderRadius: '5px', border: '1px solid var(--border-default)', background: 'var(--surface-raised)', fontSize: '12px', fontFamily: 'var(--font-mono)', outline: 'none' };
const eventHeaderStyle: React.CSSProperties = { width: '100%', display: 'flex', alignItems: 'center', padding: '8px 12px', background: 'var(--surface-raised)', border: 'none', cursor: 'pointer', fontSize: '12px', fontWeight: 500, color: 'var(--text-primary)' };

function scopeButtonStyle(active: boolean): React.CSSProperties {
  return { padding: '5px 14px', background: active ? 'var(--interactive-accent)' : 'transparent', color: active ? 'var(--text-on-accent)' : 'var(--text-muted)', border: 'none', fontSize: '12px', cursor: 'pointer', fontWeight: active ? 600 : 400, transition: 'all 0.15s' };
}

function addBtnStyle(disabled: boolean): React.CSSProperties {
  return { padding: '5px 12px', borderRadius: '5px', border: '1px solid var(--border-default)', background: 'var(--surface-raised)', color: disabled ? 'var(--text-muted)' : 'var(--text-primary)', fontSize: '12px', cursor: disabled ? 'not-allowed' : 'pointer' };
}
