import React from 'react';

import type { RulesFile } from '../../../shared/types/rulesAndSkills';

// ── SectionHeader ─────────────────────────────────────────────────────────────

export function SectionHeader({ label }: { label: string }): React.ReactElement {
  return (
    <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-text-semantic-muted select-none">
      {label}
    </div>
  );
}

// ── RuleItem ──────────────────────────────────────────────────────────────────

const RULE_LABELS: Record<'claude-md' | 'agents-md', string> = {
  'claude-md': 'CLAUDE.md',
  'agents-md': 'AGENTS.md',
};

function RuleOpenButton({ filePath, onOpen }: { filePath: string; onOpen: (path: string) => void }): React.ReactElement {
  return (
    <button
      className="text-[10px] text-interactive-accent px-1.5 py-0.5 rounded transition-colors duration-75"
      onClick={() => onOpen(filePath)}
      onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.75'; }}
      onMouseLeave={(e) => { e.currentTarget.style.opacity = '1'; }}
    >
      Open
    </button>
  );
}

function RuleCreateButton({
  type,
  onCreate,
}: {
  type: 'claude-md' | 'agents-md';
  onCreate: (type: 'claude-md' | 'agents-md') => void;
}): React.ReactElement {
  return (
    <button
      className="text-[10px] text-text-semantic-muted px-1.5 py-0.5 rounded transition-colors duration-75"
      onClick={() => onCreate(type)}
      onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--interactive-accent)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.color = ''; }}
    >
      Create
    </button>
  );
}

export function RuleItem({
  rule,
  onOpen,
  onCreate,
}: {
  rule: RulesFile;
  onOpen: (path: string) => void;
  onCreate: (type: 'claude-md' | 'agents-md') => void;
}): React.ReactElement {
  return (
    <div
      className="flex items-center gap-2 w-full px-3 py-1.5 transition-colors duration-75"
      style={{ backgroundColor: 'transparent' }}
      onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--surface-raised)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
    >
      <span
        className="inline-block h-1.5 w-1.5 flex-shrink-0 rounded-full"
        style={{ backgroundColor: rule.exists ? 'var(--status-success)' : 'var(--text-semantic-muted)' }}
        aria-label={rule.exists ? 'exists' : 'missing'}
      />
      <span className="flex-1 text-xs text-text-semantic-primary truncate">
        {RULE_LABELS[rule.type]}
      </span>
      {rule.exists
        ? <RuleOpenButton filePath={rule.filePath} onOpen={onOpen} />
        : <RuleCreateButton type={rule.type} onCreate={onCreate} />}
    </div>
  );
}
