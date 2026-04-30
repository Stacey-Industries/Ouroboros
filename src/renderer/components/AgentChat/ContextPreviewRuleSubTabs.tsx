/**
 * ContextPreviewRuleSubTabs.tsx — Wave 62.
 *
 * Sub-tab bar shown inside the Rules main tab of the context preview popover,
 * splitting rule items into User-level vs Project-level scopes. Also exports
 * the small pure helpers used by the popover to filter and count rule items
 * by group. Extracted from ContextPreview.tsx to keep that file under the
 * 300-line ESLint cap.
 */

import React from 'react';

import type {
  ContextItem,
  ContextItemKind,
  ContextPreviewModel,
  RuleGroup,
} from '../../hooks/useContextPreview';

const SUB_TAB_GROUPS: { group: RuleGroup; label: string }[] = [
  { group: 'user', label: 'User' },
  { group: 'project', label: 'Project' },
];

function SubTabButton(props: {
  group: RuleGroup;
  label: string;
  active: boolean;
  count: number;
  onSelect: (group: RuleGroup) => void;
}): React.ReactElement {
  const { group, label, active, count, onSelect } = props;
  const className = [
    'rounded px-2 py-0.5 text-[10px] transition-colors',
    active
      ? 'bg-interactive-accent-subtle text-interactive-accent font-medium'
      : 'text-text-semantic-muted hover:text-text-semantic-secondary',
  ].join(' ');
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={() => onSelect(group)}
      className={className}
      style={{ fontFamily: 'var(--font-ui)' }}
    >
      {label}
      <span className="ml-1 tabular-nums text-text-semantic-faint">{count}</span>
    </button>
  );
}

export function RuleGroupSubTabs(props: {
  active: RuleGroup;
  counts: { user: number; project: number };
  onSelect: (group: RuleGroup) => void;
}): React.ReactElement {
  return (
    <div
      className="flex gap-1 border-b border-border-subtle px-3 py-1"
      role="tablist"
      aria-label="Rule scope"
    >
      {SUB_TAB_GROUPS.map(({ group, label }) => (
        <SubTabButton
          key={group}
          group={group}
          label={label}
          active={group === props.active}
          count={props.counts[group]}
          onSelect={props.onSelect}
        />
      ))}
    </div>
  );
}

export function filterItemsForActiveTab(
  items: ContextItem[],
  activeKind: ContextItemKind,
  ruleGroup: RuleGroup,
): ContextItem[] {
  const sameKind = items.filter((i) => i.kind === activeKind);
  if (activeKind !== 'rule') return sameKind;
  return sameKind.filter((i) => (i.group ?? 'project') === ruleGroup);
}

export function buildRuleGroupCounts(items: ContextItem[]): { user: number; project: number } {
  let user = 0;
  let project = 0;
  for (const item of items) {
    if (item.kind !== 'rule') continue;
    if ((item.group ?? 'project') === 'user') user += 1;
    else project += 1;
  }
  return { user, project };
}

export function buildCountsFromItems(items: ContextItem[]): Record<ContextItemKind, number> {
  const counts: Record<ContextItemKind, number> = {
    file: 0,
    memory: 0,
    mention: 0,
    rule: 0,
    skill: 0,
    system: 0,
    tool: 0,
  };
  for (const item of items) counts[item.kind] += 1;
  return counts;
}

export function usePopoverTabState(model: ContextPreviewModel): {
  activeKind: ContextItemKind;
  setActiveKind: (k: ContextItemKind) => void;
  ruleGroup: RuleGroup;
  setRuleGroup: (g: RuleGroup) => void;
  counts: Record<ContextItemKind, number>;
  ruleCounts: { user: number; project: number };
  visibleItems: ContextItem[];
} {
  const [activeKind, setActiveKind] = React.useState<ContextItemKind>('rule');
  const counts = buildCountsFromItems(model.items);
  const ruleCounts = buildRuleGroupCounts(model.items);
  const [ruleGroup, setRuleGroup] = React.useState<RuleGroup>(
    ruleCounts.user > 0 ? 'user' : 'project',
  );
  const visibleItems = filterItemsForActiveTab(model.items, activeKind, ruleGroup);
  return { activeKind, setActiveKind, ruleGroup, setRuleGroup, counts, ruleCounts, visibleItems };
}
