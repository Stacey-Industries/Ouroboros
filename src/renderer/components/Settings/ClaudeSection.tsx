import React, { useState } from 'react';
import type { AppConfig, ClaudeCliSettings, AgentTemplate } from '../../types/electron';

interface ClaudeSectionProps {
  draft: AppConfig;
  onChange: <K extends keyof AppConfig>(key: K, value: AppConfig[K]) => void;
}

const DEFAULT_CLAUDE_SETTINGS: ClaudeCliSettings = {
  permissionMode: 'default',
  model: '',
  effort: '',
  appendSystemPrompt: '',
  verbose: false,
  maxBudgetUsd: 0,
  allowedTools: '',
  disallowedTools: '',
  addDirs: [],
  chrome: false,
  worktree: false,
  dangerouslySkipPermissions: false,
};

const PERMISSION_MODES = [
  { value: 'default', label: 'Default' },
  { value: 'acceptEdits', label: 'Accept Edits' },
  { value: 'plan', label: 'Plan' },
  { value: 'auto', label: 'Auto' },
  { value: 'bypassPermissions', label: 'Bypass Permissions' },
];

const MODEL_OPTIONS = [
  { value: '', label: '(Default)' },
  { value: 'sonnet', label: 'Sonnet' },
  { value: 'opus', label: 'Opus' },
  { value: 'haiku', label: 'Haiku' },
];

const EFFORT_LEVELS = [
  { value: '', label: '(Default)' },
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'max', label: 'Max' },
];

export function ClaudeSection({ draft, onChange }: ClaudeSectionProps): React.ReactElement {
  const settings = draft.claudeCliSettings ?? DEFAULT_CLAUDE_SETTINGS;
  const [newDir, setNewDir] = useState('');

  function handleClaudeChange<K extends keyof ClaudeCliSettings>(
    key: K,
    value: ClaudeCliSettings[K],
  ): void {
    const current = draft.claudeCliSettings ?? DEFAULT_CLAUDE_SETTINGS;
    onChange('claudeCliSettings', { ...current, [key]: value });
  }

  function handleAddDir(): void {
    const trimmed = newDir.trim();
    if (!trimmed) return;
    const dirs = [...(settings.addDirs ?? [])];
    if (!dirs.includes(trimmed)) {
      dirs.push(trimmed);
      handleClaudeChange('addDirs', dirs);
    }
    setNewDir('');
  }

  function handleRemoveDir(index: number): void {
    const dirs = [...(settings.addDirs ?? [])];
    dirs.splice(index, 1);
    handleClaudeChange('addDirs', dirs);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

      {/* Header */}
      <div>
        <SectionLabel>Claude Code Settings</SectionLabel>
        <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0 }}>
          Configure how Claude Code launches in new Claude terminals.
        </p>
      </div>

      {/* Permission Mode */}
      <section>
        <SectionLabel>Permission Mode</SectionLabel>
        <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '10px' }}>
          Controls how Claude handles tool permission requests.
        </p>
        <select
          value={settings.permissionMode}
          onChange={(e) => handleClaudeChange('permissionMode', e.target.value)}
          aria-label="Permission mode"
          style={selectStyle}
        >
          {PERMISSION_MODES.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </section>

      {/* Model */}
      <section>
        <SectionLabel>Model</SectionLabel>
        <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '10px' }}>
          Override the model used for Claude Code sessions.
        </p>
        <select
          value={settings.model}
          onChange={(e) => handleClaudeChange('model', e.target.value)}
          aria-label="Model override"
          style={selectStyle}
        >
          {MODEL_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </section>

      {/* Effort Level */}
      <section>
        <SectionLabel>Effort Level</SectionLabel>
        <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '12px' }}>
          Controls how much effort Claude puts into responses.
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
          {EFFORT_LEVELS.map((level) => {
            const isActive = (settings.effort ?? '') === level.value;
            return (
              <button
                key={level.value}
                onClick={() => handleClaudeChange('effort', level.value)}
                style={{
                  padding: '4px 12px',
                  borderRadius: '4px',
                  border: isActive ? '1px solid var(--accent)' : '1px solid var(--border)',
                  background: isActive ? 'var(--accent)' : 'transparent',
                  color: isActive ? 'var(--bg)' : 'var(--text)',
                  fontSize: '12px',
                  cursor: 'pointer',
                  fontFamily: 'var(--font-ui)',
                  transition: 'all 0.1s',
                }}
              >
                {level.label}
              </button>
            );
          })}
        </div>
      </section>

      {/* Verbose Output */}
      <section>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <SectionLabel>Verbose Output</SectionLabel>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0 }}>
              Show detailed output during Claude Code sessions.
            </p>
          </div>
          <ToggleSwitch
            checked={settings.verbose}
            onChange={(v) => handleClaudeChange('verbose', v)}
            label="Verbose output"
          />
        </div>
      </section>

      {/* Max Budget */}
      <section>
        <SectionLabel>Max Budget (USD)</SectionLabel>
        <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '10px' }}>
          Maximum dollar amount to spend per session. 0 for unlimited.
        </p>
        <input
          type="number"
          min={0}
          step={1}
          value={settings.maxBudgetUsd}
          onChange={(e) => {
            const parsed = parseFloat(e.target.value);
            if (!isNaN(parsed) && parsed >= 0) {
              handleClaudeChange('maxBudgetUsd', parsed);
            }
          }}
          aria-label="Max budget in USD"
          style={{
            width: '120px',
            padding: '7px 10px',
            borderRadius: '6px',
            border: '1px solid var(--border)',
            background: 'var(--bg-tertiary)',
            color: 'var(--text)',
            fontSize: '13px',
            fontFamily: 'var(--font-mono)',
            outline: 'none',
          }}
        />
      </section>

      {/* Allowed Tools */}
      <section>
        <SectionLabel>Allowed Tools</SectionLabel>
        <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '10px' }}>
          Comma-separated list of allowed tools (e.g. &quot;Bash(git:*) Edit&quot;). Empty = all tools.
        </p>
        <input
          type="text"
          value={settings.allowedTools}
          onChange={(e) => handleClaudeChange('allowedTools', e.target.value)}
          placeholder="e.g. Bash(git:*) Edit Read"
          aria-label="Allowed tools"
          style={textInputStyle}
        />
      </section>

      {/* Disallowed Tools */}
      <section>
        <SectionLabel>Disallowed Tools</SectionLabel>
        <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '10px' }}>
          Comma-separated list of disallowed tools. Empty = none blocked.
        </p>
        <input
          type="text"
          value={settings.disallowedTools}
          onChange={(e) => handleClaudeChange('disallowedTools', e.target.value)}
          placeholder="e.g. Bash Write"
          aria-label="Disallowed tools"
          style={textInputStyle}
        />
      </section>

      {/* System Prompt (Append) */}
      <section>
        <SectionLabel>System Prompt (Append)</SectionLabel>
        <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '10px' }}>
          Additional instructions appended to Claude&apos;s default system prompt.
        </p>
        <textarea
          value={settings.appendSystemPrompt}
          onChange={(e) => handleClaudeChange('appendSystemPrompt', e.target.value)}
          placeholder="e.g. Always respond in Spanish."
          aria-label="Append system prompt"
          rows={4}
          style={{
            ...textInputStyle,
            resize: 'vertical',
            minHeight: '80px',
            lineHeight: 1.5,
          }}
        />
      </section>

      {/* Additional Directories */}
      <section>
        <SectionLabel>Additional Directories</SectionLabel>
        <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '10px' }}>
          Extra directories Claude Code can access beyond the project root.
        </p>

        {/* Existing dirs */}
        {(settings.addDirs ?? []).length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '8px' }}>
            {settings.addDirs.map((dir, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '6px 10px',
                  borderRadius: '4px',
                  border: '1px solid var(--border)',
                  background: 'var(--bg-tertiary)',
                }}
              >
                <span
                  style={{
                    flex: 1,
                    fontSize: '12px',
                    fontFamily: 'var(--font-mono)',
                    color: 'var(--text)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {dir}
                </span>
                <button
                  onClick={() => handleRemoveDir(i)}
                  aria-label={`Remove ${dir}`}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-muted)',
                    cursor: 'pointer',
                    fontSize: '14px',
                    lineHeight: 1,
                    padding: '2px 4px',
                    flexShrink: 0,
                  }}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Add new dir */}
        <div style={{ display: 'flex', gap: '6px' }}>
          <input
            type="text"
            value={newDir}
            onChange={(e) => setNewDir(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleAddDir();
              }
            }}
            placeholder="/path/to/directory"
            aria-label="New directory path"
            style={{ ...textInputStyle, flex: 1 }}
          />
          <button
            onClick={handleAddDir}
            disabled={!newDir.trim()}
            style={{
              padding: '7px 14px',
              borderRadius: '6px',
              border: '1px solid var(--border)',
              background: newDir.trim() ? 'var(--accent)' : 'var(--bg-tertiary)',
              color: newDir.trim() ? 'var(--bg)' : 'var(--text-muted)',
              fontSize: '12px',
              cursor: newDir.trim() ? 'pointer' : 'not-allowed',
              fontWeight: 500,
              flexShrink: 0,
            }}
          >
            Add
          </button>
        </div>
      </section>

      {/* Chrome Integration */}
      <section>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <SectionLabel>Chrome Integration</SectionLabel>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0 }}>
              Enable Claude in Chrome browser integration.
            </p>
          </div>
          <ToggleSwitch
            checked={settings.chrome}
            onChange={(v) => handleClaudeChange('chrome', v)}
            label="Chrome integration"
          />
        </div>
      </section>

      {/* Git Worktree */}
      <section>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <SectionLabel>Git Worktree</SectionLabel>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0 }}>
              Create a new git worktree for each Claude Code session.
            </p>
          </div>
          <ToggleSwitch
            checked={settings.worktree}
            onChange={(v) => handleClaudeChange('worktree', v)}
            label="Git worktree"
          />
        </div>
      </section>

      {/* Agent Templates */}
      <TemplateEditor
        templates={draft.agentTemplates ?? []}
        onChange={(templates) => onChange('agentTemplates', templates)}
      />

      {/* Danger Zone */}
      <section
        style={{
          marginTop: '8px',
          padding: '16px',
          borderRadius: '8px',
          border: '1px solid rgba(239, 68, 68, 0.3)',
          background: 'rgba(239, 68, 68, 0.05)',
        }}
      >
        <SectionLabel style={{ color: '#ef4444' }}>Danger Zone</SectionLabel>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '8px' }}>
          <div style={{ flex: 1, marginRight: '16px' }}>
            <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text)', marginBottom: '4px' }}>
              Skip All Permission Checks
            </div>
            <p style={{ fontSize: '12px', color: '#f59e0b', margin: 0, lineHeight: 1.4 }}>
              Bypasses ALL permission checks. Only use in sandboxed environments with no internet access.
            </p>
          </div>
          <ToggleSwitch
            checked={settings.dangerouslySkipPermissions}
            onChange={(v) => handleClaudeChange('dangerouslySkipPermissions', v)}
            label="Skip permission checks"
            danger
          />
        </div>
      </section>

    </div>
  );
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function SectionLabel({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
}): React.ReactElement {
  return (
    <div
      style={{
        fontSize: '11px',
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        color: 'var(--text-muted)',
        marginBottom: '8px',
        ...style,
      }}
    >
      {children}
    </div>
  );
}

interface ToggleSwitchProps {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  danger?: boolean;
}

function ToggleSwitch({ checked, onChange, label, danger }: ToggleSwitchProps): React.ReactElement {
  const activeColor = danger ? '#ef4444' : 'var(--accent)';
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      style={{
        position: 'relative',
        width: '40px',
        height: '22px',
        borderRadius: '11px',
        border: 'none',
        background: checked ? activeColor : 'var(--bg-tertiary)',
        cursor: 'pointer',
        padding: 0,
        flexShrink: 0,
        transition: 'background 0.15s ease',
        boxShadow: `inset 0 0 0 1px ${checked ? 'transparent' : 'var(--border)'}`,
      }}
    >
      <span
        style={{
          position: 'absolute',
          top: '2px',
          left: checked ? '20px' : '2px',
          width: '18px',
          height: '18px',
          borderRadius: '50%',
          background: checked ? '#fff' : 'var(--text-muted)',
          transition: 'left 0.15s ease, background 0.15s ease',
        }}
      />
    </button>
  );
}

// ─── Template Editor ──────────────────────────────────────────────────────────

interface TemplateEditorProps {
  templates: AgentTemplate[];
  onChange: (templates: AgentTemplate[]) => void;
}

function TemplateEditor({ templates, onChange }: TemplateEditorProps): React.ReactElement {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Partial<AgentTemplate>>({});

  function handleAdd(): void {
    const id = `custom:${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const newTemplate: AgentTemplate = {
      id,
      name: 'New Template',
      icon: '',
      promptTemplate: '',
    };
    onChange([...templates, newTemplate]);
    setEditingId(id);
    setEditDraft(newTemplate);
  }

  function handleDelete(id: string): void {
    onChange(templates.filter((t) => t.id !== id));
    if (editingId === id) setEditingId(null);
  }

  function handleStartEdit(t: AgentTemplate): void {
    setEditingId(t.id);
    setEditDraft({ ...t });
  }

  function handleSaveEdit(): void {
    if (!editingId) return;
    onChange(
      templates.map((t) =>
        t.id === editingId ? { ...t, ...editDraft } as AgentTemplate : t,
      ),
    );
    setEditingId(null);
    setEditDraft({});
  }

  function handleCancelEdit(): void {
    setEditingId(null);
    setEditDraft({});
  }

  return (
    <section>
      <SectionLabel>Agent Templates</SectionLabel>
      <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '12px' }}>
        Quick-launch profiles for common tasks. Use <code style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent)', fontSize: '11px' }}>{'{{openFile}}'}</code>,{' '}
        <code style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent)', fontSize: '11px' }}>{'{{projectRoot}}'}</code>,{' '}
        <code style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent)', fontSize: '11px' }}>{'{{projectName}}'}</code> as variables in prompts.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '10px' }}>
        {templates.map((t) => (
          <div key={t.id}>
            {editingId === t.id ? (
              /* Inline edit form */
              <div
                style={{
                  padding: '10px',
                  borderRadius: '6px',
                  border: '1px solid var(--accent)',
                  background: 'var(--bg-tertiary)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                }}
              >
                <div style={{ display: 'flex', gap: '6px' }}>
                  <input
                    type="text"
                    value={editDraft.icon ?? ''}
                    onChange={(e) => setEditDraft((d) => ({ ...d, icon: e.target.value }))}
                    placeholder="Icon"
                    aria-label="Template icon"
                    style={{ ...textInputStyle, width: '50px', textAlign: 'center' }}
                  />
                  <input
                    type="text"
                    value={editDraft.name ?? ''}
                    onChange={(e) => setEditDraft((d) => ({ ...d, name: e.target.value }))}
                    placeholder="Template name"
                    aria-label="Template name"
                    style={{ ...textInputStyle, flex: 1 }}
                  />
                </div>
                <textarea
                  value={editDraft.promptTemplate ?? ''}
                  onChange={(e) => setEditDraft((d) => ({ ...d, promptTemplate: e.target.value }))}
                  placeholder="Prompt template (supports {{variables}})"
                  aria-label="Prompt template"
                  rows={3}
                  style={{
                    ...textInputStyle,
                    resize: 'vertical',
                    minHeight: '60px',
                    lineHeight: 1.5,
                  }}
                />
                <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                  <button onClick={handleCancelEdit} style={smallButtonStyle}>
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveEdit}
                    style={{
                      ...smallButtonStyle,
                      background: 'var(--accent)',
                      color: 'var(--bg)',
                      borderColor: 'var(--accent)',
                    }}
                  >
                    Save
                  </button>
                </div>
              </div>
            ) : (
              /* Template row */
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '8px 10px',
                  borderRadius: '6px',
                  border: '1px solid var(--border)',
                  background: 'var(--bg-tertiary)',
                }}
              >
                {t.icon && (
                  <span style={{ fontSize: '14px', flexShrink: 0, width: '20px', textAlign: 'center' }}>
                    {t.icon}
                  </span>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text)' }}>
                    {t.name}
                  </div>
                  <div
                    style={{
                      fontSize: '11px',
                      color: 'var(--text-muted)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                    title={t.promptTemplate}
                  >
                    {t.promptTemplate}
                  </div>
                </div>
                <button
                  onClick={() => handleStartEdit(t)}
                  aria-label={`Edit ${t.name}`}
                  style={{ ...iconButtonStyle }}
                  title="Edit"
                >
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M8.5 1.5L10.5 3.5L4 10H2V8L8.5 1.5Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" /></svg>
                </button>
                <button
                  onClick={() => handleDelete(t.id)}
                  aria-label={`Delete ${t.name}`}
                  style={{ ...iconButtonStyle, color: 'var(--error, #ef4444)' }}
                  title="Delete"
                >
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 2L10 10M10 2L2 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      <button
        onClick={handleAdd}
        style={{
          padding: '6px 14px',
          borderRadius: '6px',
          border: '1px solid var(--border)',
          background: 'transparent',
          color: 'var(--text)',
          fontSize: '12px',
          cursor: 'pointer',
          fontFamily: 'var(--font-ui)',
        }}
      >
        + Add Template
      </button>
    </section>
  );
}

const smallButtonStyle: React.CSSProperties = {
  padding: '4px 10px',
  borderRadius: '4px',
  border: '1px solid var(--border)',
  background: 'transparent',
  color: 'var(--text)',
  fontSize: '11px',
  cursor: 'pointer',
  fontFamily: 'var(--font-ui)',
};

const iconButtonStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: 'var(--text-muted)',
  cursor: 'pointer',
  padding: '4px',
  flexShrink: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: '4px',
};

const textInputStyle: React.CSSProperties = {
  width: '100%',
  padding: '7px 10px',
  borderRadius: '6px',
  border: '1px solid var(--border)',
  background: 'var(--bg-tertiary)',
  color: 'var(--text)',
  fontSize: '12px',
  fontFamily: 'var(--font-mono)',
  outline: 'none',
  boxSizing: 'border-box',
};

const selectStyle: React.CSSProperties = {
  width: '100%',
  padding: '7px 10px',
  borderRadius: '6px',
  border: '1px solid var(--border)',
  background: 'var(--bg-tertiary)',
  color: 'var(--text)',
  fontSize: '12px',
  fontFamily: 'var(--font-ui)',
  outline: 'none',
  boxSizing: 'border-box',
  cursor: 'pointer',
};
