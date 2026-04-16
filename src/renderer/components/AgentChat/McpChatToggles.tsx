/**
 * McpChatToggles.tsx — Per-chat MCP server enable/disable toggles (Wave 26 Phase D).
 *
 * Lists MCP servers fetched via mcp.getServers(). Initial state is drawn from:
 *   1. session-level mcpServerOverrides (if present)
 *   2. profile's mcpServers (if profile provided)
 *   3. all discovered servers enabled (fallback)
 *
 * On toggle, calls sessionCrud.setMcpOverrides and invokes onChange.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { Profile } from '../../types/electron';

// ─── Props ────────────────────────────────────────────────────────────────────

export interface McpChatTogglesProps {
  sessionId: string;
  profile?: Profile | null;
  /** Current session mcpServerOverrides from the session record (undefined = not yet loaded). */
  mcpServerOverrides?: string[];
  onChange: (enabledServers: string[]) => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function resolveInitial(
  allServers: string[],
  mcpServerOverrides: string[] | undefined,
  profile: Profile | null | undefined,
): string[] {
  if (Array.isArray(mcpServerOverrides)) return mcpServerOverrides;
  if (profile?.mcpServers) return profile.mcpServers;
  return [...allServers];
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const wrapStyle: React.CSSProperties = {
  padding: '10px 12px',
  display: 'flex',
  flexDirection: 'column',
  gap: '6px',
};

const emptyStyle: React.CSSProperties = {
  fontSize: '12px',
  opacity: 0.5,
  padding: '4px 0',
};

const rowStyle: React.CSSProperties = {
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

// ─── Hook ─────────────────────────────────────────────────────────────────────

interface McpEntry { name: string }

function useMcpServerNames(projectRoot?: string): string[] {
  const [names, setNames] = useState<string[]>([]);

  useEffect(() => {
    window.electronAPI.mcp
      .getServers(projectRoot)
      .then((res) => {
        if (res.success && res.servers) {
          setNames(res.servers.map((s: McpEntry) => s.name));
        }
      })
      .catch(() => undefined);
  }, [projectRoot]);

  return names;
}

// ─── McpChatToggles ───────────────────────────────────────────────────────────

interface UseMcpTogglesOpts {
  sessionId: string;
  profile: Profile | null | undefined;
  mcpServerOverrides: string[] | undefined;
  onChange: (names: string[]) => void;
  allServers: string[];
}

function useMcpTogglesState(opts: UseMcpTogglesOpts): { enabled: string[]; toggle: (name: string) => void } {
  const { sessionId, profile, mcpServerOverrides, onChange, allServers } = opts;

  // Extract the profile field that drives resolution so we can use it as a
  // stable, non-optional-chained dep in useMemo and useEffect below.
  const profileMcpServers = profile?.mcpServers;

  // Derive the initial resolved set synchronously via useMemo so it is ready
  // on the same render that allServers first arrives. This eliminates the
  // extra render cycle caused by useEffect → setState, which made the checked
  // state stale immediately after checkboxes appeared.
  const derived = useMemo(
    () => (allServers.length > 0 ? resolveInitial(allServers, mcpServerOverrides, profile) : null),
    [allServers, mcpServerOverrides, profile],
  );

  // Keep a ref so the toggle callback always reads the latest derived value
  // without needing to be recreated (avoids stale-closure bugs).
  const derivedRef = useRef(derived);
  derivedRef.current = derived;

  // `override` holds user-toggled state. null means "use derived".
  const [override, setOverride] = useState<string[] | null>(null);

  // Reset the user override when the controlling props change (e.g. a new
  // session is opened with different overrides or a different profile).
  useEffect(() => {
    setOverride(null);
  }, [mcpServerOverrides, profileMcpServers]);

  const enabled = override ?? derived ?? [];

  const toggle = useCallback((name: string) => {
    setOverride((prev) => {
      // Seed from derivedRef if no user override exists yet.
      const base = prev ?? derivedRef.current ?? [];
      const next = base.includes(name) ? base.filter((n) => n !== name) : [...base, name];
      void window.electronAPI.sessionCrud.setMcpOverrides(sessionId, next).catch(() => undefined);
      onChange(next);
      return next;
    });
  }, [sessionId, onChange]);
  return { enabled, toggle };
}

export function McpChatToggles({ sessionId, profile, mcpServerOverrides, onChange }: McpChatTogglesProps): React.ReactElement {
  const allServers = useMcpServerNames();
  const { enabled, toggle } = useMcpTogglesState({ sessionId, profile, mcpServerOverrides, onChange, allServers });
  if (allServers.length === 0) {
    return (
      <div style={wrapStyle}>
        <span style={emptyStyle} className="text-text-semantic-muted">No MCP servers configured.</span>
      </div>
    );
  }
  return (
    <div style={wrapStyle}>
      <div style={rowStyle}>
        {allServers.map((name) => (
          <label key={name} style={checkItemStyle} className="text-text-semantic-secondary">
            <input type="checkbox" checked={enabled.includes(name)} onChange={() => toggle(name)} />
            {name}
          </label>
        ))}
      </div>
    </div>
  );
}
