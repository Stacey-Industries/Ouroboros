/**
 * ContextPreview.tsx — Collapsed strip + tabbed popover showing what gets sent
 * with the next prompt. Tabs: Rules / Skills / Memory / Files / Mentions /
 * Tools / System. Toggle state is parent-managed (controlled).
 */

import React, { useCallback, useRef, useState } from 'react';

import type { ContextItem, ContextItemKind, ContextPreviewModel } from '../../hooks/useContextPreview';
import type { MemoryType } from '../../types/electron-memory';
import { ItemRow } from './ContextPreviewItemRow';
import { DeleteMemoryConfirm, EditMemoryModal } from './ContextPreviewMemoryModals';
import type { ContentCache } from './ContextPreviewMemoryRow';
import { MemoryItemRow } from './ContextPreviewMemoryRow';
import { RuleGroupSubTabs, usePopoverTabState } from './ContextPreviewRuleSubTabs';

// ─── Tab config ───────────────────────────────────────────────────────────────

interface TabDef {
  kind: ContextItemKind;
  label: string;
}

const TABS: TabDef[] = [
  { kind: 'rule', label: 'Rules' },
  { kind: 'skill', label: 'Skills' },
  { kind: 'memory', label: 'Memory' },
  { kind: 'file', label: 'Files' },
  { kind: 'mention', label: 'Mentions' },
  { kind: 'tool', label: 'Tools' },
  { kind: 'system', label: 'System' },
];

// ─── ContextPreviewProps ──────────────────────────────────────────────────────

export interface ContextPreviewProps {
  model: ContextPreviewModel;
  isOpen: boolean;
  onToggle: () => void;
  /** Called when the user clicks a toggleable item's checkbox. */
  onToggleItem?: (id: string) => void;
  /** Set of item IDs currently disabled (unchecked) by the user. */
  disabledIds?: ReadonlySet<string>;
  /** Project root passed to memory:read for inline drill-down. */
  projectRoot?: string | null;
}

// ─── Strip ────────────────────────────────────────────────────────────────────

function pluralize(n: number, word: string): string {
  return `${n} ${word}${n !== 1 ? 's' : ''}`;
}

function buildStripChips(totals: ContextPreviewModel['totals']): string[] {
  const parts: string[] = [];
  if (totals.rules > 0) parts.push(pluralize(totals.rules, 'rule'));
  if (totals.skills > 0) parts.push(pluralize(totals.skills, 'skill'));
  if (totals.files > 0) parts.push(pluralize(totals.files, 'file'));
  if (totals.mentions > 0) parts.push(pluralize(totals.mentions, 'mention'));
  if (totals.tools > 0) parts.push(pluralize(totals.tools, 'tool'));
  return parts;
}

function buildStripLabel(model: ContextPreviewModel): string {
  const { totals } = model;
  const total = totals.totalItems;
  if (total === 0) return 'No context — expand';
  const chips = buildStripChips(totals);
  const summary = chips.length > 0 ? ` (${chips.join(', ')})` : '';
  return `${pluralize(total, 'item')} will be sent${summary} — expand`;
}

function ChevronIcon({ open }: { open: boolean }): React.ReactElement {
  const style = {
    transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
    transition: 'transform 150ms',
  };
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true" style={style}>
      <path
        d="M2 3.5L5 6.5L8 3.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function formatTokens(n: number): string {
  return n >= 1000 ? `~${(n / 1000).toFixed(1)}k tokens` : `~${n} tokens`;
}

function ContextPreviewStrip(props: {
  model: ContextPreviewModel;
  isOpen: boolean;
  onToggle: () => void;
}): React.ReactElement {
  const { model, isOpen, onToggle } = props;
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={isOpen}
      aria-haspopup="dialog"
      data-testid="context-preview-toggle"
      className="flex w-full items-center gap-2 px-3 py-1 text-left text-[11px] text-text-semantic-muted transition-colors hover:text-text-semantic-secondary hover:bg-surface-hover"
      style={{ fontFamily: 'var(--font-ui)' }}
    >
      <ChevronIcon open={isOpen} />
      <span className="flex-1 truncate">{buildStripLabel(model)}</span>
      <span className="shrink-0 text-text-semantic-faint">
        {formatTokens(model.totals.totalTokens)}
      </span>
    </button>
  );
}

// ─── Popover ──────────────────────────────────────────────────────────────────

function TabBar(props: {
  tabs: TabDef[];
  activeKind: ContextItemKind;
  counts: Record<ContextItemKind, number>;
  onSelect: (kind: ContextItemKind) => void;
}): React.ReactElement {
  return (
    <div className="flex border-b border-border-subtle" role="tablist">
      {props.tabs.map((tab) => {
        const count = props.counts[tab.kind] ?? 0;
        const active = tab.kind === props.activeKind;
        return (
          <button
            key={tab.kind}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => props.onSelect(tab.kind)}
            className={[
              'px-3 py-1.5 text-[11px] transition-colors whitespace-nowrap',
              active
                ? 'border-b-2 border-interactive-accent text-text-semantic-primary font-medium'
                : 'text-text-semantic-muted hover:text-text-semantic-secondary',
            ].join(' ')}
            style={{ fontFamily: 'var(--font-ui)' }}
          >
            {tab.label}
            {count > 0 && (
              <span className="ml-1 rounded-full bg-interactive-accent-subtle px-1 text-[10px] text-interactive-accent">
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

const EMPTY_TAB_MESSAGES: Partial<Record<ContextItemKind, string>> = {
  memory: 'No memory entries for this project.',
  rule: 'No rules loaded for this session.',
  skill: 'No skills executed in this session.',
  file: 'No pinned files.',
  mention: 'No @mentions in this prompt.',
  system: 'No model selected.',
};

function EmptyTabMessage({ kind }: { kind: ContextItemKind }): React.ReactElement {
  const msg = EMPTY_TAB_MESSAGES[kind] ?? 'None';
  return <div className="px-3 py-2 text-[11px] text-text-semantic-faint italic">{msg}</div>;
}

function PopoverHeader(props: { totalTokens: number; onClose: () => void }): React.ReactElement {
  return (
    <div className="flex items-center justify-between border-b border-border-subtle px-3 py-2">
      <span
        className="text-[11px] font-medium text-text-semantic-secondary"
        style={{ fontFamily: 'var(--font-ui)' }}
      >
        Context sent with next prompt
      </span>
      <div className="flex items-center gap-2">
        <span className="tabular-nums text-[11px] text-text-semantic-faint">
          ~{props.totalTokens} est. tokens
        </span>
        <button
          type="button"
          onClick={props.onClose}
          aria-label="Close context preview"
          className="text-text-semantic-muted transition-colors hover:text-text-semantic-primary"
        >
          &times;
        </button>
      </div>
    </div>
  );
}

interface MemoryModal {
  kind: 'edit' | 'delete';
  id: string;
  label: string;
  description: string;
  type: MemoryType;
  content: string;
}

function useMemoryModal(visibleItems: ContextItem[]): {
  modal: MemoryModal | null;
  openEdit: (id: string) => void;
  openDelete: (id: string) => void;
  close: () => void;
} {
  const [modal, setModal] = useState<MemoryModal | null>(null);
  const close = useCallback(() => setModal(null), []);
  const openEdit = useCallback((id: string) => {
    const item = visibleItems.find((i) => i.id === `memory:${id}` || i.id === id);
    if (!item) return;
    setModal({ kind: 'edit', id, label: item.label, description: item.detail ?? '', type: 'user', content: '' });
  }, [visibleItems]);
  const openDelete = useCallback((id: string) => {
    const item = visibleItems.find((i) => i.id === `memory:${id}` || i.id === id);
    if (!item) return;
    setModal({ kind: 'delete', id, label: item.label, description: '', type: 'user', content: '' });
  }, [visibleItems]);
  return { modal, openEdit, openDelete, close };
}

function PopoverItemList(props: {
  items: ContextItem[];
  activeKind: ContextItemKind;
  disabledIds: ReadonlySet<string>;
  onToggleItem?: (id: string) => void;
  projectRoot?: string | null;
  contentCache: ContentCache;
  onEditClick?: (id: string) => void;
  onDeleteClick?: (id: string) => void;
}): React.ReactElement {
  const { items, activeKind, disabledIds, onToggleItem, projectRoot, contentCache,
    onEditClick, onDeleteClick } = props;
  if (items.length === 0) return <EmptyTabMessage kind={activeKind} />;
  return (
    <>
      {items.map((item) =>
        item.kind === 'memory' ? (
          <MemoryItemRow key={item.id} item={item} projectRoot={projectRoot}
            contentCache={contentCache} onEditClick={onEditClick} onDeleteClick={onDeleteClick} />
        ) : (
          <ItemRow key={item.id} item={item} disabled={disabledIds.has(item.id)} onToggle={onToggleItem} />
        ),
      )}
    </>
  );
}

function ContextPreviewPopover(props: {
  model: ContextPreviewModel;
  onClose: () => void;
  onToggleItem?: (id: string) => void;
  disabledIds: ReadonlySet<string>;
  projectRoot?: string | null;
}): React.ReactElement {
  const { model, onClose, onToggleItem, disabledIds, projectRoot } = props;
  const contentCache = useRef<ContentCache>({});
  const tabs = usePopoverTabState(model);
  const { activeKind, setActiveKind, ruleGroup, setRuleGroup, counts, ruleCounts, visibleItems } = tabs;
  const { modal, openEdit, openDelete, close } = useMemoryModal(visibleItems);

  return (
    <div
      role="dialog"
      aria-label="Context preview"
      data-testid="context-preview-popover"
      className="absolute bottom-full left-0 right-0 z-50 mb-1 flex flex-col rounded-lg border border-border-semantic bg-surface-panel shadow-lg"
      style={{ maxHeight: '320px' }}
    >
      <PopoverHeader totalTokens={model.totals.totalTokens} onClose={onClose} />
      <TabBar tabs={TABS} activeKind={activeKind} counts={counts} onSelect={setActiveKind} />
      {activeKind === 'rule' && (
        <RuleGroupSubTabs active={ruleGroup} counts={ruleCounts} onSelect={setRuleGroup} />
      )}
      <div className="flex-1 overflow-y-auto" role="tabpanel">
        <PopoverItemList items={visibleItems} activeKind={activeKind} disabledIds={disabledIds}
          onToggleItem={onToggleItem} projectRoot={projectRoot} contentCache={contentCache.current}
          onEditClick={openEdit} onDeleteClick={openDelete} />
      </div>
      <ActiveMemoryModal modal={modal} projectRoot={projectRoot} onClose={close} />
    </div>
  );
}

function ActiveMemoryModal(props: {
  modal: MemoryModal | null;
  projectRoot?: string | null;
  onClose: () => void;
}): React.ReactElement {
  const { modal, projectRoot, onClose } = props;
  if (modal?.kind === 'edit') {
    return (
      <EditMemoryModal id={modal.id} initialDescription={modal.description}
        initialType={modal.type} initialContent={modal.content}
        projectRoot={projectRoot} onSaved={onClose} onClose={onClose} />
    );
  }
  if (modal?.kind === 'delete') {
    return (
      <DeleteMemoryConfirm id={modal.id} label={modal.label}
        projectRoot={projectRoot} onDeleted={onClose} onClose={onClose} />
    );
  }
  return <></>;
}

// ─── ContextPreview ───────────────────────────────────────────────────────────

export function ContextPreview({
  model,
  isOpen,
  onToggle,
  onToggleItem,
  disabledIds = new Set(),
  projectRoot,
}: ContextPreviewProps): React.ReactElement {
  return (
    <div className="relative" data-testid="context-preview">
      {isOpen && (
        <ContextPreviewPopover
          model={model}
          onClose={onToggle}
          onToggleItem={onToggleItem}
          disabledIds={disabledIds}
          projectRoot={projectRoot}
        />
      )}
      <ContextPreviewStrip model={model} isOpen={isOpen} onToggle={onToggle} />
    </div>
  );
}
