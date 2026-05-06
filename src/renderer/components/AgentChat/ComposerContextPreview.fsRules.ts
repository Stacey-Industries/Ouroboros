/**
 * Filesystem-rules fallback for ComposerContextPreview.
 *
 * When a chat thread has no `claudeSessionId` yet (e.g. a fresh thread before
 * the first send), the popover would otherwise fall back to "most recent
 * running agent" — which surfaces the IDE's own terminal Claude Code session
 * and its constantly-fluctuating `loadedRules`, causing the rules count to
 * pop in and out as that session cycles through tasks.
 *
 * This module provides a stable read of the rules that WOULD be injected for
 * a chat in `projectRoot`, sourced directly from the rule-file watcher IPC.
 * The shape matches `LoadedRule` so consumers can treat it identically to
 * session-attached rules.
 */

import type { RuleDefinition } from '@shared/types/claudeConfig';
import type { LoadedRule } from '@shared/types/ruleActivity';
import { useEffect, useState } from 'react';

function mapRuleFileToLoadedRule(rule: RuleDefinition): LoadedRule {
  return {
    filePath: rule.filePath,
    name: rule.id,
    memoryType: rule.scope === 'global' ? 'User' : 'Project',
    loadReason: 'baseline',
    loadedAt: 0,
  };
}

function buildEnabledRules(ruleFiles: RuleDefinition[]): LoadedRule[] {
  const out: LoadedRule[] = [];
  for (const rule of ruleFiles) {
    if (rule.disabled === true) continue;
    out.push(mapRuleFileToLoadedRule(rule));
  }
  return out;
}

const EMPTY_RULES: LoadedRule[] = [];

/**
 * Subscribes to `rulesAndSkills:changed` and returns the live list of enabled
 * (non-disabled) rule files in scope as `LoadedRule[]`. Used as a session-less
 * fallback for the chat composer's context popover.
 */
export function useFilesystemRules(projectRoot: string | null): LoadedRule[] {
  const [rules, setRules] = useState<LoadedRule[]>(EMPTY_RULES);
  useEffect(() => {
    const api = window.electronAPI?.rulesAndSkills;
    if (!api?.listRuleFiles) return;
    let cancelled = false;
    const refetch = (): void => {
      void api.listRuleFiles(projectRoot ?? undefined).then((res) => {
        if (cancelled || !res.success || !res.ruleFiles) return;
        setRules(buildEnabledRules(res.ruleFiles));
      });
    };
    refetch();
    const off = api.onChanged?.(refetch);
    return () => {
      cancelled = true;
      off?.();
    };
  }, [projectRoot]);
  return rules;
}
