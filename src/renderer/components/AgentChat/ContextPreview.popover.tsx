/**
 * ContextPreview.popover.tsx — popover-side internals extracted from
 * ContextPreview.tsx to keep file/function size within ESLint caps.
 */

import React, { useCallback, useRef, useState } from 'react';

import type {
  ContextItem,
  ContextItemKind,
  ContextPreviewModel,
} from '../../hooks/useContextPreview';
import type { MemoryType } from '../../types/electron-memory';
import { ItemRow } from './ContextPreviewItemRow';
import { DeleteMemoryConfirm, EditMemoryModal } from './ContextPreviewMemoryModals';
import type { ContentCache } from './ContextPreviewMemoryRow';
import { MemoryItemRow } from './ContextPreviewMemoryRow';
import { RuleGroupSubTabs, usePopoverTabState } from './ContextPreviewRuleSubTabs';

export interface TabDef {
  kind: ContextItemKind;
  label: string;
}

export const TABS: TabDef[] = [
  { kind: 'rule', label: 'Rules' },
  { kind: 'skill', label: 'Skills' },
  { kind: 'memory', label: 'Memory' },
  { kind: 'file', label: 'Files' },
  { kind: 'mention', label: 'Mentions' },
  { kind: 'tool', label: 'Tools' },
  { kind: 'system', label: 'System' },
];

const EMPTY_TAB_MESSAGES: Partial<Record<ContextItemKind, string>> = {
  memory: 'No memory entries for this project.',
  rule: 'No rules loaded for this session.',
  // Wave 82 — Phase 0 decision 12 (industry-standard) full implementation
  // (listSkills IPC + available-skills list) deferred to follow-up. For now
  // the empty state explains how skills become discoverable.
  skill: 'No skills executed yet. Type / in the composer to see available commands.',
  file: 'No pinned files. Drop a file from the file tree or your OS to add one.',
  mention: 'No @mentions in this prompt. Type @ to reference a file or symbol.',
  system: 'No model selected.',
};

function EmptyTabMessage({ kind }: { kind: ContextItemKind }): React.ReactElement {
  const msg = EMPTY_TAB_MESSAGES[kind] ?? 'None';
  return <div className="px-3 py-2 text-[11px] text-text-semantic-faint italic">{msg}</div>;
}

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
  const openEdit = useCallback(
    (id: string) => {
      const item = visibleItems.find((i) => i.id === `memory:${id}` || i.id === id);
      if (!item) return;
      setModal({
        kind: 'edit',
        id,
        label: item.label,
        description: item.detail ?? '',
        type: 'user',
        content: '',
      });
    },
    [visibleItems],
  );
  const openDelete = useCallback(
    (id: string) => {
      const item = visibleItems.find((i) => i.id === `memory:${id}` || i.id === id);
      if (!item) return;
      setModal({
        kind: 'delete',
        id,
        label: item.label,
        description: '',
        type: 'user',
        content: '',
      });
    },
    [visibleItems],
  );
  return { modal, openEdit, openDelete, close };
}

interface ItemRendererProps {
  disabledIds: ReadonlySet<string>;
  onToggleItem?: (id: string) => void;
  projectRoot?: string | null;
  contentCache: ContentCache;
  onEditClick?: (id: string) => void;
  onDeleteClick?: (id: string) => void;
}

function PopoverItemRow(props: ItemRendererProps & { item: ContextItem }): React.ReactElement {
  const { item, disabledIds, onToggleItem, ...mem } = props;
  if (item.kind === 'memory') return <MemoryItemRow item={item} {...mem} />;
  return <ItemRow item={item} disabled={disabledIds.has(item.id)} onToggle={onToggleItem} />;
}

function PopoverItemList(
  props: ItemRendererProps & { items: ContextItem[]; activeKind: ContextItemKind },
): React.ReactElement {
  if (props.items.length === 0) return <EmptyTabMessage kind={props.activeKind} />;
  const { items, ...rest } = props;
  return (
    <>
      {items.map((item) => (
        <PopoverItemRow key={item.id} item={item} {...(rest as ItemRendererProps)} />
      ))}
    </>
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
      <EditMemoryModal
        id={modal.id}
        initialDescription={modal.description}
        initialType={modal.type}
        initialContent={modal.content}
        projectRoot={projectRoot}
        onSaved={onClose}
        onClose={onClose}
      />
    );
  }
  if (modal?.kind === 'delete') {
    return (
      <DeleteMemoryConfirm
        id={modal.id}
        label={modal.label}
        projectRoot={projectRoot}
        onDeleted={onClose}
        onClose={onClose}
      />
    );
  }
  return <></>;
}

type PopoverTabsState = ReturnType<typeof usePopoverTabState>;

function PopoverContent(props: {
  tabs: PopoverTabsState;
  disabledIds: ReadonlySet<string>;
  onToggleItem?: (id: string) => void;
  projectRoot?: string | null;
  contentCache: ContentCache;
  openEdit: (id: string) => void;
  openDelete: (id: string) => void;
}): React.ReactElement {
  const { tabs } = props;
  return (
    <>
      <TabBar
        tabs={TABS}
        activeKind={tabs.activeKind}
        counts={tabs.counts}
        onSelect={tabs.setActiveKind}
      />
      {tabs.activeKind === 'rule' && (
        <RuleGroupSubTabs
          active={tabs.ruleGroup}
          counts={tabs.ruleCounts}
          onSelect={tabs.setRuleGroup}
        />
      )}
      <div className="flex-1 overflow-y-auto" role="tabpanel">
        <PopoverItemList
          items={tabs.visibleItems}
          activeKind={tabs.activeKind}
          disabledIds={props.disabledIds}
          onToggleItem={props.onToggleItem}
          projectRoot={props.projectRoot}
          contentCache={props.contentCache}
          onEditClick={props.openEdit}
          onDeleteClick={props.openDelete}
        />
      </div>
    </>
  );
}

export function ContextPreviewPopover(props: {
  model: ContextPreviewModel;
  onClose: () => void;
  onToggleItem?: (id: string) => void;
  disabledIds: ReadonlySet<string>;
  projectRoot?: string | null;
}): React.ReactElement {
  const contentCache = useRef<ContentCache>({});
  const tabs = usePopoverTabState(props.model);
  const memory = useMemoryModal(tabs.visibleItems);
  return (
    <div
      role="dialog"
      aria-label="Context preview"
      data-testid="context-preview-popover"
      className="absolute bottom-full left-0 right-0 z-50 mb-1 flex flex-col rounded-lg border border-border-semantic bg-surface-panel shadow-lg"
      style={{ maxHeight: '320px' }}
    >
      <PopoverHeader totalTokens={props.model.totals.totalTokens} onClose={props.onClose} />
      <PopoverContent
        tabs={tabs}
        disabledIds={props.disabledIds}
        onToggleItem={props.onToggleItem}
        projectRoot={props.projectRoot}
        contentCache={contentCache.current}
        openEdit={memory.openEdit}
        openDelete={memory.openDelete}
      />
      <ActiveMemoryModal
        modal={memory.modal}
        projectRoot={props.projectRoot}
        onClose={memory.close}
      />
    </div>
  );
}
