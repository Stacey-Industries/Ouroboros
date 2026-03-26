import { useCallback, useEffect, useRef, useState } from 'react';

import type { CommandDefinition } from '../../shared/types/claudeConfig';
import type { RulesFile } from '../../shared/types/rulesAndSkills';

export interface UseRulesAndSkillsResult {
  rules: RulesFile[];
  commands: CommandDefinition[];
  isLoading: boolean;
  refresh: () => Promise<void>;
  createRule: (type: 'claude-md' | 'agents-md') => Promise<string | null>;
}

function hasRulesAndSkillsAPI(): boolean {
  return (
    typeof window !== 'undefined' &&
    'electronAPI' in window &&
    'rulesAndSkills' in window.electronAPI
  );
}

const EMPTY: UseRulesAndSkillsResult = {
  rules: [],
  commands: [],
  isLoading: false,
  refresh: () => Promise.resolve(),
  createRule: () => Promise.resolve(null),
};

interface FetchSetters {
  setRules: (r: RulesFile[]) => void;
  setCommands: (c: CommandDefinition[]) => void;
  setIsLoading: (v: boolean) => void;
}

async function fetchRulesAndSkills(
  root: string,
  setters: FetchSetters,
): Promise<void> {
  if (!hasRulesAndSkillsAPI()) return;
  setters.setIsLoading(true);
  try {
    const [rulesResult, commandsResult] = await Promise.all([
      window.electronAPI.rulesAndSkills.listRules(root),
      window.electronAPI.rulesAndSkills.listCommands(root),
    ]);
    if (rulesResult.success && rulesResult.rules) setters.setRules(rulesResult.rules);
    if (commandsResult.success && commandsResult.commands) setters.setCommands(commandsResult.commands);
  } finally {
    setters.setIsLoading(false);
  }
}

async function createRuleFn(
  root: string | null,
  type: 'claude-md' | 'agents-md',
  refresh: () => Promise<void>,
): Promise<string | null> {
  if (!root || !hasRulesAndSkillsAPI()) return null;
  const result = await window.electronAPI.rulesAndSkills.createRule(root, type);
  if (result.success && result.filePath) { await refresh(); return result.filePath; }
  return null;
}

export function useRulesAndSkills(projectRoot: string | null): UseRulesAndSkillsResult {
  const [rules, setRules] = useState<RulesFile[]>([]);
  const [commands, setCommands] = useState<CommandDefinition[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const projectRootRef = useRef(projectRoot);

  useEffect(() => { projectRootRef.current = projectRoot; }, [projectRoot]);

  const setters: FetchSetters = { setRules, setCommands, setIsLoading };

  const refresh = useCallback(async (): Promise<void> => {
    const root = projectRootRef.current;
    if (root) await fetchRulesAndSkills(root, setters);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- setters are stable setState refs

  const createRule = useCallback(
    (type: 'claude-md' | 'agents-md') => createRuleFn(projectRootRef.current, type, refresh),
    [refresh],
  );

  useEffect(() => {
    if (!projectRoot || !hasRulesAndSkillsAPI()) return;
    if (typeof window.electronAPI.rulesAndSkills.startWatcher === 'function') {
      void window.electronAPI.rulesAndSkills.startWatcher(projectRoot);
    }
    void refresh();
    return window.electronAPI.rulesAndSkills.onChanged(() => { void refresh(); });
  }, [projectRoot, refresh]);

  if (!projectRoot) return EMPTY;

  return { rules, commands, isLoading, refresh, createRule };
}
