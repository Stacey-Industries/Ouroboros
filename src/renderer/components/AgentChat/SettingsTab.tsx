/**
 * SettingsTab.tsx — Read-only Claude Code settings viewer in the Claude Config panel.
 *
 * Displays settings.json (global) or settings.local.json (project) as formatted JSON,
 * with a special section for permissions if present.
 */

import React, { useCallback, useEffect, useState } from 'react';

import { ScopeToggle, type ScopeValue } from './ClaudeConfigPanelParts';

// ── API guard ────────────────────────────────────────────────────────────────

function hasAPI(): boolean {
  return (
    typeof window !== 'undefined'
    && 'electronAPI' in window
    && 'rulesAndSkills' in window.electronAPI
  );
}

// ── PermissionsSection ───────────────────────────────────────────────────────

interface PermissionsData {
  allow?: string[];
  deny?: string[];
}

function PermissionList({ label, items }: { label: string; items: string[] }): React.ReactElement {
  return (
    <div className="mb-1.5">
      <span className="text-[10px] font-semibold text-text-semantic-primary uppercase tracking-wider">
        {label}
      </span>
      {items.length === 0 ? (
        <p className="text-[10px] text-text-semantic-muted pl-2 py-0.5">None</p>
      ) : (
        <ul className="pl-2">
          {items.map((item, i) => (
            <li key={i} className="text-[11px] font-mono text-text-semantic-secondary py-px">
              {item}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function PermissionsSection({ permissions }: { permissions: PermissionsData }): React.ReactElement {
  const allow = Array.isArray(permissions.allow) ? permissions.allow : [];
  const deny = Array.isArray(permissions.deny) ? permissions.deny : [];
  return (
    <div className="mb-2 p-2 rounded bg-surface-inset border border-border-semantic">
      <div className="text-[10px] font-semibold text-text-semantic-primary mb-1 uppercase tracking-wider">
        Permissions
      </div>
      <PermissionList label="Allow" items={allow} />
      <PermissionList label="Deny" items={deny} />
    </div>
  );
}

// ── SettingsJsonView ─────────────────────────────────────────────────────────

function SettingsJsonView({ settings }: { settings: Record<string, unknown> }): React.ReactElement {
  const keys = Object.keys(settings);
  if (keys.length === 0) {
    return (
      <p className="text-[10px] text-text-semantic-muted py-1">
        No settings found for this scope.
      </p>
    );
  }

  // Show permissions separately; display the rest as JSON
  const permissions = settings['permissions'];
  const hasPermissions = permissions && typeof permissions === 'object';
  const rest = { ...settings };
  if (hasPermissions) delete rest['permissions'];
  const restKeys = Object.keys(rest);

  return (
    <>
      {hasPermissions && <PermissionsSection permissions={permissions as PermissionsData} />}
      {restKeys.length > 0 && (
        <pre className="text-[10px] font-mono bg-surface-inset rounded p-2 overflow-x-auto text-text-semantic-secondary whitespace-pre-wrap break-all border border-border-semantic">
          {JSON.stringify(rest, null, 2)}
        </pre>
      )}
    </>
  );
}

// ── SettingsTab (main component) ─────────────────────────────────────────────

export interface SettingsTabProps {
  projectRoot: string | null;
}

function useSettingsData(scope: ScopeValue, projectRoot: string | null) {
  const [settings, setSettings] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async (): Promise<void> => {
    if (!hasAPI()) return;
    setLoading(true);
    setError(null);
    try {
      const result = await window.electronAPI.rulesAndSkills.readClaudeSettings(scope, projectRoot ?? undefined);
      if (result.success && result.settings) { setSettings(result.settings); }
      else { setSettings({}); if (result.error) setError(result.error); }
    } catch (err: unknown) {
      setSettings({});
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [scope, projectRoot]);

  useEffect(() => { void reload(); }, [reload]);
  return { settings, loading, error };
}

export function SettingsTab({ projectRoot }: SettingsTabProps): React.ReactElement {
  const [scope, setScope] = useState<ScopeValue>('global');
  const { settings, loading, error } = useSettingsData(scope, projectRoot);
  const scopeLabel = scope === 'global' ? '~/.claude/settings.json' : '.claude/settings.local.json';

  return (
    <div className="flex flex-col gap-0">
      <ScopeToggle scope={scope} onScopeChange={setScope} />
      <div className="px-3 pb-2">
        <p className="text-[10px] text-text-semantic-muted mb-1.5">{scopeLabel}</p>
        {loading ? (
          <div className="text-[10px] text-text-semantic-muted animate-pulse py-1">Loading settings...</div>
        ) : error ? (
          <div className="text-[10px] text-status-error py-1">{error}</div>
        ) : (
          <SettingsJsonView settings={settings} />
        )}
      </div>
    </div>
  );
}
