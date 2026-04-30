import React, { useCallback, useEffect, useState } from 'react';

import type { RuleDefinition } from '../../../shared/types/claudeConfig';
import type { RulesFile } from '../../../shared/types/rulesAndSkills';
import { InlineCreateForm, ScopeToggle, type ScopeValue } from './ClaudeConfigPanelParts';
import { RuleItem, SectionHeader } from './RulesSkillsPanelParts';
import {
  DisabledPill,
  hasAnyDisabled,
  RestoreAllButton,
  RuleRowToggle,
  useRestoreAll,
  useRuleToggle,
} from './RulesTabToggle';

// ── Props ──────────────────────────────────────────────────────────────────

export interface RulesTabProps {
  rules: RulesFile[];
  onOpenFile: (filePath: string) => void;
  onCreateRule: (type: 'claude-md' | 'agents-md') => Promise<void>;
  projectRoot: string | null;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function hasAPI(): boolean {
  return (
    typeof window !== 'undefined' &&
    'electronAPI' in window &&
    'rulesAndSkills' in window.electronAPI
  );
}

const SCOPE_BADGE: Record<string, string> = { global: '◈', project: '▣' };

const DEFAULT_RULE_CONTENT = (name: string): string =>
  `# Rule: ${name}\n\nDescribe the rule here.\n`;

// ── IPC hooks ──────────────────────────────────────────────────────────────

function useRuleFiles(
  scope: ScopeValue,
  projectRoot: string | null,
): {
  ruleFiles: RuleDefinition[];
  reload: () => void;
} {
  const [ruleFiles, setRuleFiles] = useState<RuleDefinition[]>([]);

  const reload = useCallback(() => {
    if (!hasAPI() || !projectRoot) return;
    void window.electronAPI.rulesAndSkills.listRuleFiles(projectRoot).then((result) => {
      if (result.success && result.ruleFiles) {
        setRuleFiles(result.ruleFiles.filter((r) => r.scope === scope));
      }
    });
  }, [scope, projectRoot]);

  useEffect(() => {
    if (!hasAPI()) return;
    reload();
    return window.electronAPI.rulesAndSkills.onChanged(() => {
      reload();
    });
  }, [reload]);

  return { ruleFiles, reload };
}

function useRuleCreate(
  scope: ScopeValue,
  projectRoot: string | null,
  onOpenFile: (filePath: string) => void,
): (name: string) => void {
  return useCallback(
    (name: string) => {
      if (!hasAPI()) return;
      void window.electronAPI.rulesAndSkills
        .createRuleFile({
          scope,
          name,
          content: DEFAULT_RULE_CONTENT(name),
          projectRoot: projectRoot ?? undefined,
        })
        .then((result) => {
          if (result.success && result.filePath) {
            onOpenFile(result.filePath);
          }
        });
    },
    [scope, projectRoot, onOpenFile],
  );
}

function useRuleDelete(scope: ScopeValue, projectRoot: string | null): (id: string) => void {
  return useCallback(
    (id: string) => {
      if (!hasAPI()) return;
      void window.electronAPI.rulesAndSkills.deleteRuleFile({
        scope,
        name: id,
        projectRoot: projectRoot ?? undefined,
      });
    },
    [scope, projectRoot],
  );
}

// ── RuleFileActionButtons ──────────────────────────────────────────────────

function RuleFileActionButtons({
  filePath,
  id,
  scope,
  onOpen,
  onDelete,
}: {
  filePath: string;
  id: string;
  scope: string;
  onOpen: (filePath: string) => void;
  onDelete: (id: string, scope: string) => void;
}): React.ReactElement {
  return (
    <span className="flex items-center gap-1 ml-auto flex-shrink-0">
      <button
        className="text-[10px] text-interactive-accent px-1.5 py-0.5 rounded transition-colors duration-75"
        onClick={() => onOpen(filePath)}
        onMouseEnter={(e) => {
          e.currentTarget.style.opacity = '0.75';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.opacity = '1';
        }}
      >
        Open
      </button>
      <button
        className="text-[10px] text-status-error px-1 py-0.5 rounded transition-colors duration-75 opacity-0 group-hover:opacity-100"
        onClick={() => onDelete(id, scope)}
      >
        Delete
      </button>
    </span>
  );
}

// ── RuleFileItem ───────────────────────────────────────────────────────────

const handleRuleMouseEnter = (e: React.MouseEvent<HTMLDivElement>): void => {
  e.currentTarget.style.backgroundColor = 'var(--surface-raised)';
};
const handleRuleMouseLeave = (e: React.MouseEvent<HTMLDivElement>): void => {
  e.currentTarget.style.backgroundColor = 'transparent';
};

function RuleFileName({
  id,
  description,
  isDisabled,
}: {
  id: string;
  description: string;
  isDisabled: boolean;
}): React.ReactElement {
  return (
    <span className="flex flex-col min-w-0 flex-1">
      <span className="flex items-center gap-1 min-w-0">
        <span className="text-xs font-medium text-text-semantic-primary truncate">{id}.md</span>
        {isDisabled && <DisabledPill />}
      </span>
      {description && (
        <span className="text-[10px] text-text-semantic-muted truncate">{description}</span>
      )}
    </span>
  );
}

function RuleFileItem({
  rule,
  onOpen,
  onDelete,
  onToggle,
}: {
  rule: RuleDefinition;
  onOpen: (filePath: string) => void;
  onDelete: (id: string, scope: string) => void;
  onToggle: (id: string, disable: boolean) => void;
}): React.ReactElement {
  const isDisabled = rule.disabled === true;
  return (
    <div
      className="group flex items-center gap-2 w-full px-3 py-1.5 transition-colors duration-75"
      style={{ backgroundColor: 'transparent', opacity: isDisabled ? 0.55 : 1 }}
      onMouseEnter={handleRuleMouseEnter}
      onMouseLeave={handleRuleMouseLeave}
    >
      <span className="text-[10px] text-text-semantic-muted flex-shrink-0" title={rule.scope}>
        {SCOPE_BADGE[rule.scope] ?? '?'}
      </span>
      <RuleRowToggle enabled={!isDisabled} onToggle={() => onToggle(rule.id, !isDisabled)} />
      <RuleFileName id={rule.id} description={rule.description} isDisabled={isDisabled} />
      <RuleFileActionButtons
        filePath={rule.filePath}
        id={rule.id}
        scope={rule.scope}
        onOpen={onOpen}
        onDelete={onDelete}
      />
    </div>
  );
}

// ── RuleFileList ───────────────────────────────────────────────────────────

function RuleFileList({
  ruleFiles,
  onOpen,
  onDelete,
  onToggle,
}: {
  ruleFiles: RuleDefinition[];
  onOpen: (filePath: string) => void;
  onDelete: (id: string, scope: string) => void;
  onToggle: (id: string, disable: boolean) => void;
}): React.ReactElement {
  if (ruleFiles.length === 0) {
    return (
      <div className="px-3 py-1.5 text-[10px] text-text-semantic-muted">No rule files found</div>
    );
  }
  return (
    <>
      {ruleFiles.map((rule) => (
        <RuleFileItem
          key={`${rule.scope}:${rule.id}`}
          rule={rule}
          onOpen={onOpen}
          onDelete={onDelete}
          onToggle={onToggle}
        />
      ))}
    </>
  );
}

// ── RulesTab (root) ────────────────────────────────────────────────────────

export function RulesTab({
  rules,
  onOpenFile,
  onCreateRule,
  projectRoot,
}: RulesTabProps): React.ReactElement {
  const [scope, setScope] = useState<ScopeValue>('global');
  const { ruleFiles } = useRuleFiles(scope, projectRoot);

  const handleCreate = useRuleCreate(scope, projectRoot, onOpenFile);
  const handleDelete = useRuleDelete(scope, projectRoot);
  const handleToggle = useRuleToggle(scope, projectRoot);
  const handleRestoreAll = useRestoreAll(scope, projectRoot);

  const onDelete = useCallback((id: string) => handleDelete(id), [handleDelete]);

  return (
    <div className="flex flex-col gap-0">
      <SectionHeader label="Rules" />
      {rules.map((rule) => (
        <RuleItem key={rule.type} rule={rule} onOpen={onOpenFile} onCreate={onCreateRule} />
      ))}
      <SectionHeader label="Rule Files" />
      <div className="flex items-center justify-between px-3 pb-1">
        <ScopeToggle scope={scope} onScopeChange={setScope} />
        {hasAnyDisabled(ruleFiles) && <RestoreAllButton onRestore={handleRestoreAll} />}
      </div>
      <RuleFileList
        ruleFiles={ruleFiles}
        onOpen={onOpenFile}
        onDelete={onDelete}
        onToggle={handleToggle}
      />
      <InlineCreateForm onCreate={handleCreate} placeholder="+ New Rule" />
    </div>
  );
}
