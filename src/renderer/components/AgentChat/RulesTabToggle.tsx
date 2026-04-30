import React, { useCallback } from 'react';

import type { RuleDefinition } from '../../../shared/types/claudeConfig';
import type { ScopeValue } from './ClaudeConfigPanelParts';

// ── Helpers ────────────────────────────────────────────────────────────────

function hasAPI(): boolean {
  return (
    typeof window !== 'undefined' &&
    'electronAPI' in window &&
    'rulesAndSkills' in window.electronAPI
  );
}

// ── useRuleToggle ──────────────────────────────────────────────────────────

export function useRuleToggle(
  scope: ScopeValue,
  projectRoot: string | null,
): (id: string, disable: boolean) => void {
  return useCallback(
    (id: string, disable: boolean) => {
      if (!hasAPI()) return;
      void window.electronAPI.rulesAndSkills.toggleRuleFile({
        scope,
        name: id,
        disable,
        projectRoot: projectRoot ?? undefined,
      });
    },
    [scope, projectRoot],
  );
}

// ── useRestoreAll ──────────────────────────────────────────────────────────

export function useRestoreAll(scope: ScopeValue, projectRoot: string | null): () => void {
  return useCallback(() => {
    if (!hasAPI()) return;
    void window.electronAPI.rulesAndSkills.restoreAllDisabledRules({
      scope,
      projectRoot: projectRoot ?? undefined,
    });
  }, [scope, projectRoot]);
}

// ── RuleRowToggle ──────────────────────────────────────────────────────────

export function RuleRowToggle({
  enabled,
  onToggle,
}: {
  enabled: boolean;
  onToggle: () => void;
}): React.ReactElement {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      aria-label={enabled ? 'Disable rule' : 'Enable rule'}
      onClick={onToggle}
      className="flex-shrink-0 relative rounded-full border border-transparent p-0 transition-colors duration-150"
      style={{
        width: 24,
        height: 14,
        backgroundColor: enabled ? 'var(--interactive-accent)' : 'var(--surface-raised)',
        cursor: 'pointer',
      }}
    >
      <span
        aria-hidden="true"
        style={{
          position: 'absolute',
          top: 2,
          left: enabled ? 12 : 2,
          width: 10,
          height: 10,
          borderRadius: '50%',
          backgroundColor: 'var(--text-primary)',
          transition: 'left 150ms ease',
        }}
      />
    </button>
  );
}

// ── DisabledPill ───────────────────────────────────────────────────────────

export function DisabledPill(): React.ReactElement {
  return (
    <span className="text-[9px] text-text-semantic-muted border border-border-semantic rounded px-1 py-px ml-1 flex-shrink-0">
      off this session
    </span>
  );
}

// ── RestoreAllButton ───────────────────────────────────────────────────────

export function RestoreAllButton({ onRestore }: { onRestore: () => void }): React.ReactElement {
  return (
    <button
      type="button"
      className="text-[10px] text-interactive-accent px-1.5 py-0.5 rounded transition-opacity duration-75 hover:opacity-75"
      onClick={onRestore}
    >
      Restore all
    </button>
  );
}

// ── hasAnyDisabled ─────────────────────────────────────────────────────────

export function hasAnyDisabled(ruleFiles: RuleDefinition[]): boolean {
  return ruleFiles.some((r) => r.disabled === true);
}
