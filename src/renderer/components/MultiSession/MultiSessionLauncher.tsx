/**
 * MultiSessionLauncher.tsx — Modal/panel for configuring and launching parallel Claude Code sessions.
 *
 * Shows configurable "slots" (2-4 parallel sessions), each with template selection,
 * custom prompt input, and optional CLI override toggles. "Launch All" spawns all
 * sessions simultaneously via agent-ide:spawn-claude-template DOM events.
 */

import React, { memo, useState, useCallback, useEffect } from 'react';
import type { AgentTemplate, ClaudeCliSettings } from '../../types/electron';
import { useProject } from '../../contexts/ProjectContext';
import { resolveTemplate } from '../../utils/templateResolver';

// ─── Types ────────────────────────────────────────────────────────────────────

interface SessionSlot {
  id: string;
  templateId: string | '__custom__';
  customPrompt: string;
  modelOverride: string;
  effortOverride: string;
}

function createSlot(): SessionSlot {
  return {
    id: `slot-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
    templateId: '__custom__',
    customPrompt: '',
    modelOverride: '',
    effortOverride: '',
  };
}

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_SLOTS = 4;

const MODEL_OPTIONS = [
  { value: '', label: 'Default' },
  { value: 'sonnet', label: 'Sonnet' },
  { value: 'opus', label: 'Opus' },
  { value: 'haiku', label: 'Haiku' },
];

const EFFORT_OPTIONS = [
  { value: '', label: 'Default' },
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'max', label: 'Max' },
];

// ─── Slot editor ──────────────────────────────────────────────────────────────

interface SlotEditorProps {
  slot: SessionSlot;
  index: number;
  templates: AgentTemplate[];
  onUpdate: (id: string, updates: Partial<SessionSlot>) => void;
  onRemove: (id: string) => void;
  canRemove: boolean;
}

const SlotEditor = memo(function SlotEditor({
  slot,
  index,
  templates,
  onUpdate,
  onRemove,
  canRemove,
}: SlotEditorProps): React.ReactElement {
  const isCustom = slot.templateId === '__custom__';

  return (
    <div
      className="rounded p-3 flex flex-col gap-2"
      style={{
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border)',
      }}
    >
      {/* Header row */}
      <div className="flex items-center gap-2">
        <span
          className="text-[11px] font-semibold shrink-0"
          style={{ color: 'var(--accent)' }}
        >
          Session {index + 1}
        </span>

        {/* Template selector */}
        <select
          value={slot.templateId}
          onChange={(e) => onUpdate(slot.id, { templateId: e.target.value })}
          style={{
            flex: 1,
            minWidth: 0,
            background: 'var(--bg)',
            color: 'var(--text)',
            border: '1px solid var(--border)',
            borderRadius: '4px',
            padding: '3px 8px',
            fontSize: '11px',
            fontFamily: 'var(--font-ui)',
            cursor: 'pointer',
          }}
          aria-label={`Template for session ${index + 1}`}
        >
          <option value="__custom__">Custom prompt</option>
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.icon ? `${t.icon} ` : ''}{t.name}
            </option>
          ))}
        </select>

        {/* Remove button */}
        {canRemove && (
          <button
            onClick={() => onRemove(slot.id)}
            className="shrink-0 p-1 rounded transition-colors"
            style={{
              color: 'var(--text-faint)',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--error)'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-faint)'; }}
            title="Remove session"
            aria-label={`Remove session ${index + 1}`}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
              <path d="M2.5 2.5L9.5 9.5M9.5 2.5L2.5 9.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        )}
      </div>

      {/* Custom prompt input (shown when template is Custom) */}
      {isCustom && (
        <textarea
          value={slot.customPrompt}
          onChange={(e) => onUpdate(slot.id, { customPrompt: e.target.value })}
          placeholder="Enter a prompt for this session..."
          rows={2}
          style={{
            width: '100%',
            background: 'var(--bg)',
            border: '1px solid var(--border)',
            borderRadius: '4px',
            color: 'var(--text)',
            fontSize: '11px',
            fontFamily: 'var(--font-mono)',
            padding: '6px 8px',
            outline: 'none',
            resize: 'vertical',
            minHeight: '40px',
            lineHeight: 1.5,
            boxSizing: 'border-box',
          }}
          aria-label={`Custom prompt for session ${index + 1}`}
        />
      )}

      {/* CLI overrides row */}
      <div className="flex items-center gap-2">
        <span
          className="text-[10px] shrink-0"
          style={{ color: 'var(--text-faint)' }}
        >
          Overrides:
        </span>

        {/* Model */}
        <select
          value={slot.modelOverride}
          onChange={(e) => onUpdate(slot.id, { modelOverride: e.target.value })}
          style={{
            background: 'var(--bg)',
            color: 'var(--text)',
            border: '1px solid var(--border)',
            borderRadius: '3px',
            padding: '2px 6px',
            fontSize: '10px',
            fontFamily: 'var(--font-ui)',
            cursor: 'pointer',
          }}
          aria-label={`Model override for session ${index + 1}`}
        >
          {MODEL_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>

        {/* Effort */}
        <select
          value={slot.effortOverride}
          onChange={(e) => onUpdate(slot.id, { effortOverride: e.target.value })}
          style={{
            background: 'var(--bg)',
            color: 'var(--text)',
            border: '1px solid var(--border)',
            borderRadius: '3px',
            padding: '2px 6px',
            fontSize: '10px',
            fontFamily: 'var(--font-ui)',
            cursor: 'pointer',
          }}
          aria-label={`Effort override for session ${index + 1}`}
        >
          {EFFORT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>
    </div>
  );
});

// ─── Main component ───────────────────────────────────────────────────────────

export interface MultiSessionLauncherProps {
  onClose: () => void;
  onLaunched: (sessionLabels: string[]) => void;
}

export const MultiSessionLauncher = memo(function MultiSessionLauncher({
  onClose,
  onLaunched,
}: MultiSessionLauncherProps): React.ReactElement {
  const { projectRoot } = useProject();
  const [slots, setSlots] = useState<SessionSlot[]>(() => [createSlot(), createSlot()]);
  const [templates, setTemplates] = useState<AgentTemplate[]>([]);

  // Load agent templates from config
  useEffect(() => {
    window.electronAPI?.config?.get('agentTemplates').then((t) => {
      if (t) setTemplates(t);
    }).catch(() => { /* use empty */ });
  }, []);

  const handleUpdate = useCallback((id: string, updates: Partial<SessionSlot>) => {
    setSlots((prev) => prev.map((s) => (s.id === id ? { ...s, ...updates } : s)));
  }, []);

  const handleRemove = useCallback((id: string) => {
    setSlots((prev) => prev.filter((s) => s.id !== id));
  }, []);

  const handleAddSlot = useCallback(() => {
    setSlots((prev) => {
      if (prev.length >= MAX_SLOTS) return prev;
      return [...prev, createSlot()];
    });
  }, []);

  const handleLaunchAll = useCallback(() => {
    const ctx = {
      projectRoot,
      projectName: projectRoot?.replace(/\\/g, '/').split('/').pop() ?? '',
      openFile: null as string | null,
      openFileName: null as string | null,
    };

    const labels: string[] = [];

    for (const slot of slots) {
      let prompt: string;
      let label: string;
      let cliOverrides: Partial<ClaudeCliSettings> | undefined;

      if (slot.templateId === '__custom__') {
        if (!slot.customPrompt.trim()) continue; // skip empty custom slots
        prompt = slot.customPrompt.trim();
        label = prompt.slice(0, 40) + (prompt.length > 40 ? '...' : '');
      } else {
        const template = templates.find((t) => t.id === slot.templateId);
        if (!template) continue;
        prompt = resolveTemplate(template.promptTemplate, ctx);
        label = template.name;
        cliOverrides = template.cliOverrides ? { ...template.cliOverrides } : undefined;
      }

      // Apply slot-level CLI overrides
      if (slot.modelOverride || slot.effortOverride) {
        cliOverrides = cliOverrides ? { ...cliOverrides } : {};
        if (slot.modelOverride) cliOverrides.model = slot.modelOverride;
        if (slot.effortOverride) cliOverrides.effort = slot.effortOverride;
      }

      labels.push(label);

      window.dispatchEvent(new CustomEvent('agent-ide:spawn-claude-template', {
        detail: { prompt, label, cliOverrides },
      }));
    }

    if (labels.length > 0) {
      onLaunched(labels);
    }
  }, [slots, templates, projectRoot, onLaunched]);

  const canLaunch = slots.some((s) =>
    s.templateId !== '__custom__' || s.customPrompt.trim().length > 0,
  );

  return (
    <div
      className="flex flex-col h-full"
      style={{ background: 'var(--bg)' }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-2 px-3 py-2 flex-shrink-0"
        style={{ borderBottom: '1px solid var(--border)' }}
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          aria-hidden="true"
          style={{ color: 'var(--accent)', flexShrink: 0 }}
        >
          <rect x="1" y="1" width="5" height="6" rx="1" />
          <rect x="10" y="1" width="5" height="6" rx="1" />
          <rect x="1" y="9" width="5" height="6" rx="1" />
          <rect x="10" y="9" width="5" height="6" rx="1" />
        </svg>
        <span
          className="text-xs font-semibold flex-1"
          style={{ color: 'var(--text)' }}
        >
          Multi-Session Launch
        </span>
        <button
          onClick={onClose}
          className="shrink-0 p-1 rounded transition-colors"
          style={{
            color: 'var(--text-faint)',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--text)'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-faint)'; }}
          title="Close"
          aria-label="Close multi-session launcher"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
            <path d="M2.5 2.5L9.5 9.5M9.5 2.5L2.5 9.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {/* Slots list */}
      <div
        className="flex-1 min-h-0 overflow-y-auto px-3 py-2"
        style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}
      >
        {slots.map((slot, i) => (
          <SlotEditor
            key={slot.id}
            slot={slot}
            index={i}
            templates={templates}
            onUpdate={handleUpdate}
            onRemove={handleRemove}
            canRemove={slots.length > 1}
          />
        ))}
      </div>

      {/* Footer: Add Session + Launch All */}
      <div
        className="flex items-center gap-2 px-3 py-2 flex-shrink-0"
        style={{ borderTop: '1px solid var(--border)' }}
      >
        {/* Add Session */}
        <button
          onClick={handleAddSlot}
          disabled={slots.length >= MAX_SLOTS}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded text-[11px] font-medium transition-colors"
          style={{
            background: 'transparent',
            border: '1px solid var(--border)',
            color: slots.length >= MAX_SLOTS ? 'var(--text-faint)' : 'var(--text-muted)',
            cursor: slots.length >= MAX_SLOTS ? 'not-allowed' : 'pointer',
            fontFamily: 'var(--font-ui)',
            opacity: slots.length >= MAX_SLOTS ? 0.5 : 1,
          }}
          onMouseEnter={(e) => {
            if (slots.length < MAX_SLOTS) {
              (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--accent)';
              (e.currentTarget as HTMLButtonElement).style.color = 'var(--text)';
            }
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border)';
            (e.currentTarget as HTMLButtonElement).style.color = slots.length >= MAX_SLOTS ? 'var(--text-faint)' : 'var(--text-muted)';
          }}
          title={slots.length >= MAX_SLOTS ? `Maximum ${MAX_SLOTS} sessions` : 'Add another session slot'}
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
            <path d="M5 1v8M1 5h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          Add Session
        </button>

        <span className="flex-1" />

        {/* Slot count */}
        <span
          className="text-[10px] tabular-nums"
          style={{ color: 'var(--text-faint)' }}
        >
          {slots.length} / {MAX_SLOTS}
        </span>

        {/* Launch All */}
        <button
          onClick={handleLaunchAll}
          disabled={!canLaunch}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded text-[11px] font-semibold transition-colors"
          style={{
            background: canLaunch ? 'var(--accent)' : 'var(--bg-tertiary)',
            color: canLaunch ? 'var(--bg)' : 'var(--text-faint)',
            border: 'none',
            cursor: canLaunch ? 'pointer' : 'not-allowed',
            fontFamily: 'var(--font-ui)',
          }}
          title={canLaunch ? 'Launch all configured sessions simultaneously' : 'Configure at least one session with a prompt'}
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor" aria-hidden="true">
            <path d="M2 1l7 4-7 4V1z" />
          </svg>
          Launch All
        </button>
      </div>
    </div>
  );
});
