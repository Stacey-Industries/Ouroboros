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
 *   - Wave 63: fetch MCP server list (static path) and surface them in Tools tab.
 *
 * Disabled IDs are kept per-mount (per chat thread, since the composer is
 * remounted on thread switch). Persisting across reloads is deferred — see
 * useContextPreview docstring for follow-ups.
 */

import type { LoadedRule, SkillExecutionRecord } from '@shared/types/ruleActivity';
import React, { useCallback, useEffect, useMemo, useState } from 'react';

import { useAgentEventsContext } from '../../contexts/AgentEventsContext';
import { useProjectOptional } from '../../contexts/ProjectContext';
import type { McpToolItem } from '../../hooks/useContextPreview';
import { parseRuleToggleId, useContextPreview } from '../../hooks/useContextPreview';
import { useMemoryEntries } from '../../hooks/useMemoryEntries';
import type { ChatOverrides } from './ChatControlsBar';
import { ContextPreview } from './ContextPreview';
import type { PinnedFile } from './useAgentChatContext';

export interface ComposerContextPreviewProps {
  pinnedFiles?: PinnedFile[];
  chatOverrides?: ChatOverrides;
  settingsModel?: string;
  mentionLabels?: { estimatedTokens: number; label: string }[];
  /**
   * Wave 64 — the active chat thread's Claude Code session UUID (from stream-json
   * init). When provided, the popover scopes its Rules/Skills lookup to this
   * exact session and registers it in the agent-events reducer so InstructionsLoaded
   * events have a record to attach to. When absent, falls back to "most recent
   * running agent" for backward compat with non-chat surfaces.
   */
  claudeSessionId?: string;
  /**
   * Wave 71 — when provided, the popover runs in controlled mode: the parent
   * owns the local-disabled set so it can be threaded into the send path and
   * cleared after a successful send. When absent, falls back to internal state
   * for backward compat with non-chat mounts.
   */
  disabledLocalIds?: ReadonlySet<string>;
  setDisabledLocalIds?: React.Dispatch<React.SetStateAction<ReadonlySet<string>>>;
}

function useActiveSessionRulesAndSkills(claudeSessionId?: string): {
  loadedRules: LoadedRule[];
  skillExecutions: SkillExecutionRecord[];
} {
  const { agents } = useAgentEventsContext();
  return useMemo(() => {
    const target = claudeSessionId
      ? agents.find((s) => s.id === claudeSessionId)
      : pickMostRecent(agents);
    return {
      loadedRules: target?.loadedRules ?? [],
      skillExecutions: target?.skillExecutions ?? [],
    };
  }, [agents, claudeSessionId]);
}

function pickMostRecent(agents: readonly AgentSessionLike[]): AgentSessionLike | undefined {
  const running = agents.filter((s) => s.status === 'running');
  if (running.length > 0) return running.reduce((a, b) => (a.startedAt > b.startedAt ? a : b));
  return agents.reduce<AgentSessionLike | undefined>((a, b) => {
    if (!a) return b;
    return b.startedAt > a.startedAt ? b : a;
  }, undefined);
}

interface AgentSessionLike {
  id: string;
  status: string;
  startedAt: number;
  loadedRules?: LoadedRule[];
  skillExecutions?: SkillExecutionRecord[];
}

/**
 * Wave 64 — when `claudeSessionId` is set and no agent record exists for it,
 * dispatch SESSION_REGISTER so subsequent InstructionsLoaded events attach.
 */
function useChatSessionBridge(
  claudeSessionId: string | undefined,
  projectRoot: string | null,
): void {
  const { agents, registerChatSession } = useAgentEventsContext();
  useEffect(() => {
    if (!claudeSessionId) return;
    if (agents.some((s) => s.id === claudeSessionId)) return;
    registerChatSession({ sessionId: claudeSessionId, cwd: projectRoot ?? undefined });
  }, [claudeSessionId, projectRoot, agents, registerChatSession]);
}

/**
 * Wave 63 — fetches the merged MCP server list (global + project scopes) via the
 * existing `mcp:getServers` IPC. Disabled servers are included so the Tools tab
 * can render them with a "disabled" badge. Re-fetches when projectRoot changes.
 */
function useMcpTools(projectRoot: string | null): McpToolItem[] {
  const [items, setItems] = useState<McpToolItem[]>([]);
  useEffect(() => {
    const api = window.electronAPI?.mcp;
    if (!api?.getServers) return;
    let cancelled = false;
    void api.getServers(projectRoot ?? undefined).then((res) => {
      if (cancelled || !res.success || !res.servers) return;
      setItems(res.servers.map((s) => ({ server: s.name, enabled: s.enabled })));
    });
    return () => {
      cancelled = true;
    };
  }, [projectRoot]);
  return items;
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

function useLocalDisabledIds(
  controlledIds?: ReadonlySet<string>,
  controlledSetter?: React.Dispatch<React.SetStateAction<ReadonlySet<string>>>,
): {
  ids: ReadonlySet<string>;
  toggle: (id: string) => void;
} {
  const [internalIds, setInternalIds] = useState<ReadonlySet<string>>(new Set());
  const isControlled = controlledIds !== undefined && controlledSetter !== undefined;
  const ids = isControlled ? controlledIds : internalIds;
  const setter = isControlled ? controlledSetter : setInternalIds;
  const toggle = useCallback(
    (id: string) => {
      setter((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    },
    [setter],
  );
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

function useComposerContextPreviewModel(
  props: ComposerContextPreviewProps,
  projectRoot: string | null,
) {
  const { loadedRules, skillExecutions } = useActiveSessionRulesAndSkills(props.claudeSessionId);
  const mcpTools = useMcpTools(projectRoot);
  const memoryEntries = useMemoryEntries(projectRoot);
  const { ids: localIds, toggle: toggleLocal } = useLocalDisabledIds(
    props.disabledLocalIds,
    props.setDisabledLocalIds,
  );
  const fsDisabledRuleIds = useFilesystemDisabledRuleIds(projectRoot);
  const disabledIds = useMergedDisabledIds(localIds, fsDisabledRuleIds);
  const handleToggleItem = useToggleHandler(fsDisabledRuleIds, toggleLocal, projectRoot);
  const previewModel = useContextPreview({
    effort: props.chatOverrides?.effort,
    loadedRules,
    mcpTools,
    memoryEntries,
    mentionLabels: props.mentionLabels ?? [],
    model: props.chatOverrides?.model || props.settingsModel,
    pinnedFileNames: pinnedFilesToInput(props.pinnedFiles),
    skillExecutions,
  });
  return { previewModel, handleToggleItem, disabledIds };
}

export function ComposerContextPreview(props: ComposerContextPreviewProps): React.ReactElement {
  const [isOpen, setIsOpen] = useState(false);
  const projectRoot = useProjectOptional()?.projectRoot ?? null;
  useChatSessionBridge(props.claudeSessionId, projectRoot);
  const { previewModel, handleToggleItem, disabledIds } = useComposerContextPreviewModel(
    props,
    projectRoot,
  );
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
