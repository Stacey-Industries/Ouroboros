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
import React, { useCallback, useMemo, useState } from 'react';

import { useAgentEventsContext } from '../../contexts/AgentEventsContext';
import { useContextPreview } from '../../hooks/useContextPreview';
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

export function ComposerContextPreview({
  pinnedFiles,
  chatOverrides,
  settingsModel,
}: ComposerContextPreviewProps): React.ReactElement {
  const [isOpen, setIsOpen] = useState(false);
  const [disabledIds, setDisabledIds] = useState<ReadonlySet<string>>(new Set());
  const { loadedRules, skillExecutions } = useActiveSessionRulesAndSkills();
  const model = chatOverrides?.model || settingsModel;
  const effort = chatOverrides?.effort;
  const previewModel = useContextPreview({
    effort,
    loadedRules,
    mentionLabels: [],
    model,
    pinnedFileNames: pinnedFilesToInput(pinnedFiles),
    skillExecutions,
  });
  const handleToggle = useCallback(() => setIsOpen((v) => !v), []);
  const handleToggleItem = useCallback((id: string) => {
    setDisabledIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
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
