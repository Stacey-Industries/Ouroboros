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
import log from 'electron-log/renderer';
import React, { useCallback, useEffect, useMemo, useState } from 'react';

import { useAgentEventsContext } from '../../contexts/AgentEventsContext';
import { useProjectOptional } from '../../contexts/ProjectContext';
import type { McpToolItem } from '../../hooks/useContextPreview';
import { parseRuleToggleId, useContextPreview } from '../../hooks/useContextPreview';
import { useMemoryEntries } from '../../hooks/useMemoryEntries';
import type { ImageAttachment } from '../../types/electron';
import type { ChatOverrides } from './ChatControlsBar';
import { useFilesystemRules } from './ComposerContextPreview.fsRules';
import { ContextPreview } from './ContextPreview';
import type { PinnedFile } from './useAgentChatContext';

export interface ComposerContextPreviewProps {
  pinnedFiles?: PinnedFile[];
  /** Wave 82 — attachments surface in the Files tab so they're visible. */
  attachments?: ImageAttachment[];
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
  /**
   * Wave 82.1 — explicit project root for the popover's project-scoped IPCs
   * (rule files, MCP servers, memory entries). When provided, takes precedence
   * over `ProjectContext.projectRoot`. The chat-only workbench passes its
   * `LayoutState.activeProject` here because `ProjectContext.projectRoot` is
   * tied to the multi-root list's first entry and does not track the rail's
   * active project. Without this, the popover queried the wrong project's
   * rule files (symptom: 0 project rules in either project).
   */
  projectRoot?: string | null;
}

function useActiveSessionRulesAndSkills(
  claudeSessionId: string | undefined,
  projectRoot: string | null,
): {
  loadedRules: LoadedRule[];
  skillExecutions: SkillExecutionRecord[];
} {
  const { agents } = useAgentEventsContext();
  // Stable filesystem-rules read for the no-session case. When a chat thread
  // has no claudeSessionId yet (fresh thread, no first send), we used to fall
  // back to "most recent running agent" — which surfaced the IDE's terminal
  // Claude Code session and its fluctuating loadedRules, causing the count
  // to pop in and out. Filesystem rules give a stable baseline.
  const filesystemRules = useFilesystemRules(projectRoot);
  return useMemo(() => {
    if (!claudeSessionId) {
      const userRulesCount = filesystemRules.filter((r) => r.memoryType === 'User').length;
      const projectRulesCount = filesystemRules.filter((r) => r.memoryType !== 'User').length;
      log.info('[trace:ctx-preview] subscription fired', {
        claudeSessionId: null,
        projectRoot,
        userRulesCount,
        projectRulesCount,
        source: 'useMemo(no-session)',
      });
      return { loadedRules: filesystemRules, skillExecutions: [] };
    }
    const target = agents.find((s) => s.id === claudeSessionId);
    const rules = target?.loadedRules ?? [];
    const userRulesCount = rules.filter((r) => r.memoryType === 'User').length;
    const projectRulesCount = rules.filter((r) => r.memoryType !== 'User').length;
    // [trace:agent-record] Site 3 — log store session IDs alongside the queried claudeSessionId.
    log.info('[trace:agent-record] lookup', { queriedSessionId: claudeSessionId, foundKey: target?.id ?? null, foundUserRulesCount: userRulesCount, foundProjectRulesCount: projectRulesCount, storeSessionIds: agents.map((s) => s.id) });
    log.info('[trace:ctx-preview] subscription fired', { claudeSessionId, projectRoot, userRulesCount, projectRulesCount, source: 'useMemo(session-found)', agentFound: !!target });
    return {
      loadedRules: rules,
      skillExecutions: target?.skillExecutions ?? [],
    };
  }, [agents, claudeSessionId, filesystemRules, projectRoot]);
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

const EMPTY_MENTION_LABELS: { estimatedTokens: number; label: string }[] = [];

function useComposerContextPreviewModel(
  props: ComposerContextPreviewProps,
  projectRoot: string | null,
) {
  const { loadedRules, skillExecutions } = useActiveSessionRulesAndSkills(
    props.claudeSessionId,
    projectRoot,
  );
  const mcpTools = useMcpTools(projectRoot);
  const memoryEntries = useMemoryEntries(projectRoot);
  const { ids: localIds, toggle: toggleLocal } = useLocalDisabledIds(
    props.disabledLocalIds,
    props.setDisabledLocalIds,
  );
  const fsDisabledRuleIds = useFilesystemDisabledRuleIds(projectRoot);
  const disabledIds = useMergedDisabledIds(localIds, fsDisabledRuleIds);
  const handleToggleItem = useToggleHandler(fsDisabledRuleIds, toggleLocal, projectRoot);
  // Stabilize derived array refs so `useContextPreview`'s memo doesn't
  // invalidate on every keystroke. `props.pinnedFiles` is stable from the
  // store (useShallow); `pinnedFilesToInput` would otherwise produce a fresh
  // mapped array on every render.
  const pinnedFileNames = useMemo(() => pinnedFilesToInput(props.pinnedFiles), [props.pinnedFiles]);
  const mentionLabels = props.mentionLabels ?? EMPTY_MENTION_LABELS;
  // Wave 82 — surface attachments in popover. Token estimate is the byte
  // length of the base64 data divided by 4 (matches the same heuristic used
  // for other context items). For non-image attachments we count the name.
  const attachments = useMemo(
    () =>
      (props.attachments ?? []).map((a) => ({
        estimatedTokens: Math.max(1, Math.ceil((a.base64Data?.length ?? a.name.length) / 4)),
        name: a.name,
      })),
    [props.attachments],
  );
  const previewModel = useContextPreview({
    attachments,
    effort: props.chatOverrides?.effort,
    loadedRules,
    mcpTools,
    memoryEntries,
    mentionLabels,
    model: props.chatOverrides?.model || props.settingsModel,
    pinnedFileNames,
    skillExecutions,
  });
  return { previewModel, handleToggleItem, disabledIds };
}

export function ComposerContextPreview(props: ComposerContextPreviewProps): React.ReactElement {
  const [isOpen, setIsOpen] = useState(false);
  // Wave 82.1 — prefer explicit prop over ProjectContext (chat-only workbench
  // passes its LayoutState.activeProject because the multi-root context isn't
  // rail-aware). Falls back to ProjectContext for IDE-shell mounts.
  const contextProjectRoot = useProjectOptional()?.projectRoot ?? null;
  const projectRoot = props.projectRoot ?? contextProjectRoot;
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
      projectRoot={projectRoot}
    />
  );
}
