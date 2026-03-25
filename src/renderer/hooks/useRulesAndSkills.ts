import { useCallback, useEffect, useRef, useState } from 'react';

import type { RulesFile, SkillDefinition } from '../../shared/types/rulesAndSkills';

export interface UseRulesAndSkillsResult {
  rules: RulesFile[];
  skills: SkillDefinition[];
  isLoading: boolean;
  refresh: () => Promise<void>;
  createRule: (type: 'claude-md' | 'agents-md') => Promise<string | null>;
  createSkill: (name: string) => Promise<string | null>;
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
  skills: [],
  isLoading: false,
  refresh: () => Promise.resolve(),
  createRule: () => Promise.resolve(null),
  createSkill: () => Promise.resolve(null),
};

async function fetchRulesAndSkills(
  root: string,
  setRules: (r: RulesFile[]) => void,
  setSkills: (s: SkillDefinition[]) => void,
  setIsLoading: (v: boolean) => void,
): Promise<void> {
  if (!hasRulesAndSkillsAPI()) return;
  setIsLoading(true);
  try {
    const [rulesResult, skillsResult] = await Promise.all([
      window.electronAPI.rulesAndSkills.listRules(root),
      window.electronAPI.rulesAndSkills.listSkills(root),
    ]);
    if (rulesResult.success && rulesResult.rules) setRules(rulesResult.rules);
    if (skillsResult.success && skillsResult.skills) setSkills(skillsResult.skills);
  } finally {
    setIsLoading(false);
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

async function createSkillFn(
  root: string | null,
  name: string,
  refresh: () => Promise<void>,
): Promise<string | null> {
  if (!root || !hasRulesAndSkillsAPI()) return null;
  const result = await window.electronAPI.rulesAndSkills.createSkill(root, name);
  if (result.success && result.filePath) { await refresh(); return result.filePath; }
  return null;
}

export function useRulesAndSkills(projectRoot: string | null): UseRulesAndSkillsResult {
  const [rules, setRules] = useState<RulesFile[]>([]);
  const [skills, setSkills] = useState<SkillDefinition[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const projectRootRef = useRef(projectRoot);

  useEffect(() => { projectRootRef.current = projectRoot; }, [projectRoot]);

  const refresh = useCallback(async (): Promise<void> => {
    const root = projectRootRef.current;
    if (root) await fetchRulesAndSkills(root, setRules, setSkills, setIsLoading);
  }, []);

  const createRule = useCallback(
    (type: 'claude-md' | 'agents-md') => createRuleFn(projectRootRef.current, type, refresh),
    [refresh],
  );

  const createSkill = useCallback(
    (name: string) => createSkillFn(projectRootRef.current, name, refresh),
    [refresh],
  );

  useEffect(() => {
    if (!projectRoot || !hasRulesAndSkillsAPI()) return;
    void refresh();
    return window.electronAPI.rulesAndSkills.onChanged(() => { void refresh(); });
  }, [projectRoot, refresh]);

  if (!projectRoot) return EMPTY;

  return { rules, skills, isLoading, refresh, createRule, createSkill };
}
