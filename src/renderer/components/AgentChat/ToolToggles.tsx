/**
 * ToolToggles.tsx — Per-chat tool enable/disable toggles (Wave 26 Phase D).
 *
 * Shows a grouped grid of all known tool names. Initial state is drawn from:
 *   1. session-level toolOverrides (if present)
 *   2. profile's enabledTools (if profile provided and has the field)
 *   3. all tools enabled (fallback)
 *
 * On toggle, calls sessionCrud.setToolOverrides and invokes onChange.
 */

import React, { useCallback, useEffect, useState } from 'react';

import type { Profile } from '../../types/electron';

// ─── Tool catalogue ───────────────────────────────────────────────────────────

export interface ToolGroup {
  label: string;
  tools: string[];
}

export const TOOL_GROUPS: ToolGroup[] = [
  { label: 'File ops', tools: ['Read', 'Write', 'Edit', 'MultiEdit'] },
  { label: 'Shell', tools: ['Bash'] },
  { label: 'Search', tools: ['Grep', 'Glob'] },
  { label: 'Agent', tools: ['Task', 'TodoWrite'] },
  { label: 'Web', tools: ['WebSearch', 'WebFetch'] },
];

export const ALL_KNOWN_TOOLS: string[] = TOOL_GROUPS.flatMap((g) => g.tools);

// ─── Props ────────────────────────────────────────────────────────────────────

export interface ToolTogglesProps {
  sessionId: string;
  profile?: Profile | null;
  /** Current session toolOverrides from the session record (undefined = not yet loaded). */
  toolOverrides?: string[];
  onChange: (enabledTools: string[]) => void;
}

// ─── Initial state helper ─────────────────────────────────────────────────────

function resolveInitial(
  toolOverrides: string[] | undefined,
  profile: Profile | null | undefined,
): string[] {
  if (Array.isArray(toolOverrides)) return toolOverrides;
  if (profile?.enabledTools) return profile.enabledTools;
  return [...ALL_KNOWN_TOOLS];
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const wrapStyle: React.CSSProperties = {
  padding: '10px 12px',
  display: 'flex',
  flexDirection: 'column',
  gap: '10px',
};

const groupStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
};

const groupLabelStyle: React.CSSProperties = {
  fontSize: '10px',
  fontWeight: 600,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  opacity: 0.6,
  marginBottom: '2px',
};

const toolRowStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: '4px 10px',
};

const checkItemStyle: React.CSSProperties = {
  fontSize: '12px',
  display: 'flex',
  alignItems: 'center',
  gap: '5px',
  cursor: 'pointer',
};

// ─── ToolToggles ──────────────────────────────────────────────────────────────

function useToolTogglesState(
  sessionId: string,
  profile: Profile | null | undefined,
  toolOverrides: string[] | undefined,
  onChange: (tools: string[]) => void,
): { enabled: string[]; toggle: (tool: string) => void } {
  const [enabled, setEnabled] = useState<string[]>(() => resolveInitial(toolOverrides, profile));
  useEffect(() => { setEnabled(resolveInitial(toolOverrides, profile)); }, [toolOverrides, profile]);
  const toggle = useCallback((tool: string) => {
    setEnabled((prev) => {
      const next = prev.includes(tool) ? prev.filter((t) => t !== tool) : [...prev, tool];
      void window.electronAPI.sessionCrud.setToolOverrides(sessionId, next).catch(() => undefined);
      onChange(next);
      return next;
    });
  }, [sessionId, onChange]);
  return { enabled, toggle };
}

interface ToolGroupProps { group: typeof TOOL_GROUPS[number]; enabled: string[]; toggle: (tool: string) => void }

function ToolGroup({ group, enabled, toggle }: ToolGroupProps): React.ReactElement {
  return (
    <div style={groupStyle}>
      <div style={groupLabelStyle} className="text-text-semantic-muted">{group.label}</div>
      <div style={toolRowStyle}>
        {group.tools.map((tool) => (
          <label key={tool} style={checkItemStyle} className="text-text-semantic-secondary">
            <input type="checkbox" checked={enabled.includes(tool)} onChange={() => toggle(tool)} />
            {tool}
          </label>
        ))}
      </div>
    </div>
  );
}

export function ToolToggles({ sessionId, profile, toolOverrides, onChange }: ToolTogglesProps): React.ReactElement {
  const { enabled, toggle } = useToolTogglesState(sessionId, profile, toolOverrides, onChange);
  return (
    <div style={wrapStyle}>
      {TOOL_GROUPS.map((group) => (
        <ToolGroup key={group.label} group={group} enabled={enabled} toggle={toggle} />
      ))}
    </div>
  );
}
