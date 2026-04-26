/**
 * HooksConfigSubsection.tsx — Manage .claude/settings.json hooks entries.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';

import { useProject } from '../../contexts/ProjectContext';
import type { HooksConfig } from '../../types/electron';
import {
  addBtnStyle,
  addInputStyle,
  categoryLabelStyle,
  eventBodyStyle,
  eventHeaderStyle,
  eventSectionStyle,
  hookCmdStyle,
  hookRowStyle,
  removeBtnStyle,
  scopeButtonStyle,
  scopeToggleStyle,
} from './HooksConfigSubsectionStyles';
import { SectionLabel } from './settingsStyles';

type HookScope = 'global' | 'project';

const HOOK_EVENT_CATEGORIES: { label: string; events: string[] }[] = [
  { label: 'Lifecycle', events: ['SessionStart', 'SessionEnd', 'Stop', 'StopFailure', 'Setup'] },
  { label: 'Tools', events: ['PreToolUse', 'PostToolUse', 'PostToolUseFailure'] },
  { label: 'Agents', events: ['SubagentStart', 'SubagentStop', 'TeammateIdle'] },
  { label: 'Tasks', events: ['TaskCreated', 'TaskCompleted'] },
  {
    label: 'Conversation',
    events: ['UserPromptSubmit', 'Elicitation', 'ElicitationResult', 'Notification'],
  },
  {
    label: 'Workspace',
    events: ['CwdChanged', 'FileChanged', 'WorktreeCreate', 'WorktreeRemove', 'ConfigChange'],
  },
  { label: 'Context', events: ['PreCompact', 'PostCompact', 'InstructionsLoaded'] },
  { label: 'Permissions', events: ['PermissionRequest', 'PermissionDenied'] },
];

interface HooksConfigSubsectionProps {
  projectRoot?: string;
}

function hasRulesAndSkillsAPI(): boolean {
  return (
    typeof window !== 'undefined' &&
    'electronAPI' in window &&
    'rulesAndSkills' in window.electronAPI
  );
}

async function fetchHooks(scope: HookScope, projectRoot: string | undefined): Promise<HooksConfig> {
  if (!hasRulesAndSkillsAPI()) return {};
  const result = await window.electronAPI.rulesAndSkills.getHooksConfig(scope, projectRoot);
  return result.success && result.hooks ? result.hooks : {};
}

function ScopeToggle({
  scope,
  onScopeChange,
}: {
  scope: HookScope;
  onScopeChange: (s: HookScope) => void;
}): React.ReactElement {
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

function AddHookRow({ onAdd }: { onAdd: (command: string) => Promise<void> }): React.ReactElement {
  const [value, setValue] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  async function handleAdd(): Promise<void> {
    const cmd = value.trim();
    if (!cmd) return;
    setIsAdding(true);
    try {
      await onAdd(cmd);
      setValue('');
    } finally {
      setIsAdding(false);
    }
  }

  return (
    <div style={{ display: 'flex', gap: '6px', marginTop: '6px' }}>
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            void handleAdd();
          }
        }}
        placeholder="Shell command..."
        className="text-text-semantic-primary"
        style={addInputStyle}
      />
      <button
        onClick={() => void handleAdd()}
        disabled={!value.trim() || isAdding}
        style={addBtnStyle(!value.trim() || isAdding)}
      >
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

function HookEntriesList({
  eventType,
  matchers,
  onRemove,
}: HookEntriesListProps): React.ReactElement {
  if (!matchers.length) {
    return (
      <p className="text-text-semantic-muted" style={{ fontSize: '11px', margin: '4px 0' }}>
        No hooks registered.
      </p>
    );
  }
  return (
    <>
      {matchers.map((matcher, mi) =>
        (matcher.hooks ?? []).map((hook, hi) => (
          <div key={`${mi}-${hi}`} style={hookRowStyle}>
            <span className="text-text-semantic-secondary" style={hookCmdStyle}>
              {hook.command}
            </span>
            <button
              onClick={() => void onRemove(eventType, mi)}
              aria-label="Remove hook"
              style={removeBtnStyle}
            >
              ✕
            </button>
          </div>
        )),
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

function HookEventSection({
  eventType,
  hooks,
  onAdd,
  onRemove,
}: HookEventSectionProps): React.ReactElement {
  const [isOpen, setIsOpen] = useState(false);
  const matchers = hooks[eventType] ?? [];
  const hookCount = matchers.reduce((sum, m) => sum + (m.hooks?.length ?? 0), 0);
  return (
    <div style={eventSectionStyle}>
      <button onClick={() => setIsOpen((v) => !v)} style={eventHeaderStyle} aria-expanded={isOpen}>
        <span style={{ flex: 1, textAlign: 'left' }}>{eventType}</span>
        <span className="text-text-semantic-muted" style={{ fontSize: '11px' }}>
          {hookCount} hook{hookCount !== 1 ? 's' : ''}
        </span>
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

interface HooksSubsectionModel {
  scope: HookScope;
  hooks: HooksConfig;
  setScope: (s: HookScope) => void;
  handleAdd: (eventType: string, command: string) => Promise<void>;
  handleRemove: (eventType: string, index: number) => Promise<void>;
}

function useHooksSubsection(projectRoot: string | undefined): HooksSubsectionModel {
  const [scope, setScope] = useState<HookScope>('global');
  const [hooks, setHooks] = useState<HooksConfig>({});
  const scopeRef = useRef(scope);
  const projectRootRef = useRef(projectRoot);

  useEffect(() => {
    scopeRef.current = scope;
  }, [scope]);
  useEffect(() => {
    projectRootRef.current = projectRoot;
  }, [projectRoot]);

  const reload = useCallback(async (): Promise<void> => {
    setHooks(await fetchHooks(scopeRef.current, projectRootRef.current));
  }, []);

  useEffect(() => {
    void reload();
  }, [reload, scope, projectRoot]);

  const handleAdd = useCallback(
    async (eventType: string, command: string): Promise<void> => {
      if (!hasRulesAndSkillsAPI()) return;
      await window.electronAPI.rulesAndSkills.addHook({ scope, eventType, command, projectRoot });
      await reload();
    },
    [scope, projectRoot, reload],
  );

  const handleRemove = useCallback(
    async (eventType: string, index: number): Promise<void> => {
      if (!hasRulesAndSkillsAPI()) return;
      await window.electronAPI.rulesAndSkills.removeHook({ scope, eventType, index, projectRoot });
      await reload();
    },
    [scope, projectRoot, reload],
  );

  return { scope, hooks, setScope, handleAdd, handleRemove };
}

function HooksSubsectionView({
  scope,
  hooks,
  setScope,
  handleAdd,
  handleRemove,
}: HooksSubsectionModel): React.ReactElement {
  return (
    <section>
      <SectionLabel>Hook Commands</SectionLabel>
      <p className="text-text-semantic-muted" style={{ fontSize: '12px', marginBottom: '12px' }}>
        Register shell commands that run at specific Claude Code lifecycle events.
      </p>
      <ScopeToggle scope={scope} onScopeChange={setScope} />
      <div style={{ marginTop: '12px' }}>
        {HOOK_EVENT_CATEGORIES.map((category, ci) => (
          <div key={category.label} style={ci > 0 ? { marginTop: '12px' } : undefined}>
            <p className="text-text-semantic-muted" style={categoryLabelStyle}>
              {category.label}
            </p>
            {category.events.map((eventType) => (
              <HookEventSection
                key={eventType}
                eventType={eventType}
                hooks={hooks}
                onAdd={handleAdd}
                onRemove={handleRemove}
              />
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}

export function HooksConfigSubsection({
  projectRoot: projectRootProp,
}: HooksConfigSubsectionProps): React.ReactElement {
  const { projectRoot: contextRoot } = useProject();
  const projectRoot = projectRootProp ?? contextRoot ?? undefined;
  const model = useHooksSubsection(projectRoot);
  return <HooksSubsectionView {...model} />;
}

