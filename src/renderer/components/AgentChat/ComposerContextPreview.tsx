/**
 * ComposerContextPreview — Thin adapter that wires the existing
 * `useContextPreview` hook + `ContextPreview` component into the chat
 * composer (Wave 59 Phase F).
 *
 * Responsibilities:
 *   - Read the active session's loaded rules + skill executions from the
 *     agent-events context.
 *   - Compute the model + effort from chatOverrides / settings model.
 *   - Manage open/closed and disabled-IDs state locally.
 *
 * Disabled IDs are kept per-mount (per chat thread, since the composer is
 * remounted on thread switch). Persisting across reloads is deferred — see
 * useContextPreview docstring for follow-ups.
 */

import type { LoadedRule, SkillExecutionRecord } from '@shared/types/ruleActivity';
import React, { useCallback, useEffect, useMemo, useState } from 'react';

import { useAgentEventsContext } from '../../contexts/AgentEventsContext';
import { useProjectOptional } from '../../contexts/ProjectContext';
import { parseRuleToggleId, useContextPreview } from '../../hooks/useContextPreview';
import type { ChatOverrides } from './ChatControlsBar';
import { ContextPreview } from './ContextPreview';
import type { PinnedFile } from './useAgentChatContext';

export interface ComposerContextPreviewProps {
  pinnedFiles?: PinnedFile[];
  chatOverrides?: ChatOverrides;
  settingsModel?: string;
}

function useActiveSessionRulesAndSkills(): {
  loadedRules: LoadedRule[];
  skillExecutions: SkillExecutionRecord[];
} {
  const { agents } = useAgentEventsContext();
  return useMemo(() => {
    const running = agents.filter((s) => s.status === 'running');
    const target =
      running.length > 0
        ? running.reduce((a, b) => (a.startedAt > b.startedAt ? a : b))
        : agents.reduce<(typeof agents)[number] | undefined>((a, b) => {
            if (!a) return b;
            return b.startedAt > a.startedAt ? b : a;
          }, undefined);
    return {
      loadedRules: target?.loadedRules ?? [],
      skillExecutions: target?.skillExecutions ?? [],
    };
  }, [agents]);
}

function pinnedFilesToInput(
  pinned: PinnedFile[] | undefined,
): { estimatedTokens: number; name: string; path: string }[] {
  return (pinned ?? []).map((f) => ({
    estimatedTokens: f.estimatedTokens,
    name: f.name,
    path: f.path,
  }));
}

function fireRuleToggleIpc(id: string, willDisable: boolean, projectRoot: string | null): void {
  const parsed = parseRuleToggleId(id);
  if (!parsed) return;
  const api = window.electronAPI?.rulesAndSkills;
  if (!api?.toggleRuleFile) return;
  void api.toggleRuleFile({
    scope: parsed.scope,
    name: parsed.name,
    disable: willDisable,
    projectRoot: projectRoot ?? undefined,
  });
}

function useLocalDisabledIds(): {
  ids: ReadonlySet<string>;
  toggle: (id: string) => void;
} {
  const [ids, setIds] = useState<ReadonlySet<string>>(new Set());
  const toggle = useCallback((id: string) => {
    setIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  return { ids, toggle };
}

/**
 * Wave 62 — subscribes to `rulesAndSkills:changed` and exposes the live set of
 * rule IDs currently in the disabled sibling dir, encoded as `rule:<scope>:<name>`.
 * Source of truth for the popover's per-rule checkbox state, so toggling in
 * the utility drawer (or anywhere else) reflects in the popover within the
 * watcher's debounce window (~1s) instead of the previous ~30s session-bound lag.
 */
function useFilesystemDisabledRuleIds(projectRoot: string | null): ReadonlySet<string> {
  const [ids, setIds] = useState<ReadonlySet<string>>(new Set());
  useEffect(() => {
    const api = window.electronAPI?.rulesAndSkills;
    if (!api?.listRuleFiles) return;
    let cancelled = false;
    const refetch = (): void => {
      void api.listRuleFiles(projectRoot ?? undefined).then((res) => {
        if (cancelled || !res.success || !res.ruleFiles) return;
        const next = new Set<string>();
        for (const r of res.ruleFiles) {
          if (r.disabled === true) next.add(`rule:${r.scope}:${r.id}`);
        }
        setIds(next);
      });
    };
    refetch();
    const off = api.onChanged?.(refetch);
    return () => {
      cancelled = true;
      off?.();
    };
  }, [projectRoot]);
  return ids;
}

function useMergedDisabledIds(
  local: ReadonlySet<string>,
  filesystem: ReadonlySet<string>,
): ReadonlySet<string> {
  return useMemo(() => {
    const out = new Set<string>(local);
    filesystem.forEach((id) => out.add(id));
    return out;
  }, [local, filesystem]);
}

function useToggleHandler(
  fsDisabledRuleIds: ReadonlySet<string>,
  toggleLocal: (id: string) => void,
  projectRoot: string | null,
): (id: string) => void {
  return useCallback(
    (id: string) => {
      if (id.startsWith('rule:')) {
        fireRuleToggleIpc(id, !fsDisabledRuleIds.has(id), projectRoot);
        return;
      }
      toggleLocal(id);
    },
    [fsDisabledRuleIds, projectRoot, toggleLocal],
  );
}

export function ComposerContextPreview({
  pinnedFiles,
  chatOverrides,
  settingsModel,
}: ComposerContextPreviewProps): React.ReactElement {
  const [isOpen, setIsOpen] = useState(false);
  const { loadedRules, skillExecutions } = useActiveSessionRulesAndSkills();
  const projectRoot = useProjectOptional()?.projectRoot ?? null;
  const { ids: localIds, toggle: toggleLocal } = useLocalDisabledIds();
  const fsDisabledRuleIds = useFilesystemDisabledRuleIds(projectRoot);
  const disabledIds = useMergedDisabledIds(localIds, fsDisabledRuleIds);
  const handleToggleItem = useToggleHandler(fsDisabledRuleIds, toggleLocal, projectRoot);
  const previewModel = useContextPreview({
    effort: chatOverrides?.effort,
    loadedRules,
    mentionLabels: [],
    model: chatOverrides?.model || settingsModel,
    pinnedFileNames: pinnedFilesToInput(pinnedFiles),
    skillExecutions,
  });
  const handleToggle = useCallback(() => setIsOpen((v) => !v), []);
  return (
    <ContextPreview
      model={previewModel}
      isOpen={isOpen}
      onToggle={handleToggle}
      onToggleItem={handleToggleItem}
      disabledIds={disabledIds}
    />
  );
}
