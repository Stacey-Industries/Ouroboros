/**
 * NewTerminalMenu - dropdown shown when clicking the "+" button in the terminal tab bar.
 * Offers Terminal, Claude Code, and Codex options with hover submenus for model selection.
 */

import React, { useRef, useState } from 'react';

import type { CodexModelOption } from '../../types/electron';
import type { ModelOption } from './NewTerminalMenu.hooks';
import {
  groupByName,
  useClaudeModels,
  useCodexModels,
  useMenuDismiss,
  useMenuPosition,
} from './NewTerminalMenu.hooks';

function TerminalIcon(): React.ReactElement<any> {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <rect x="1.5" y="2.5" width="13" height="11" rx="1.5" />
      <path d="M4.5 5.5L7 8L4.5 10.5" strokeLinecap="round" strokeLinejoin="round" />
      <line x1="9" y1="10.5" x2="11.5" y2="10.5" strokeLinecap="round" />
    </svg>
  );
}

function ChevronRightIcon(): React.ReactElement<any> {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 10 10"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    >
      <path d="M3.5 2L6.5 5L3.5 8" />
    </svg>
  );
}

function ClaudeSubmenu({
  models,
  onSelect,
}: {
  models: ModelOption[];
  onSelect: (value: string) => void;
}): React.ReactElement<any> {
  const groups = groupByName(models);
  return (
    <div className="absolute left-full top-0 -mt-1 ml-0.5 z-50 min-w-[180px] max-h-[280px] overflow-y-auto rounded border border-border-semantic bg-surface-panel shadow-lg py-1">
      {Array.from(groups.entries()).map(([group, items]) => (
        <div key={group}>
          <div className="px-2 py-0.5 text-[9px] font-medium uppercase tracking-wider text-text-semantic-muted opacity-60">
            {group}
          </div>
          {items.map((model) => (
            <button
              key={model.value}
              role="menuitem"
              className="w-full text-left px-3 py-1 text-[11px] text-text-semantic-primary hover:bg-surface-raised transition-colors duration-100 cursor-pointer"
              onClick={() => onSelect(model.value)}
            >
              {model.label}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}

function CodexSubmenu({
  models,
  onSelect,
}: {
  models: CodexModelOption[];
  onSelect: (value: string) => void;
}): React.ReactElement<any> {
  return (
    <div className="absolute left-full top-0 -mt-1 ml-0.5 z-50 min-w-[200px] max-h-[280px] overflow-y-auto rounded border border-border-semantic bg-surface-panel shadow-lg py-1">
      {models.map((model) => (
        <button
          key={model.id}
          role="menuitem"
          className="w-full text-left px-3 py-1 text-[11px] text-text-semantic-primary hover:bg-surface-raised transition-colors duration-100 cursor-pointer"
          onClick={() => onSelect(model.id)}
          title={model.description}
        >
          {model.name}
        </button>
      ))}
    </div>
  );
}

const MENU_ITEM =
  'w-full flex items-center gap-2 px-3 py-1.5 text-[11px] text-text-semantic-primary hover:bg-surface-raised transition-colors duration-100 cursor-pointer';

function MenuRow({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}): React.ReactElement<any> {
  return (
    <button role="menuitem" className={MENU_ITEM} onClick={onClick}>
      {children}
    </button>
  );
}

interface ProviderSectionProps {
  active: 'claude' | 'codex' | null;
  setActive: React.Dispatch<React.SetStateAction<'claude' | 'codex' | null>>;
  submenuKey: 'claude' | 'codex';
  label: string;
  iconClassName: string;
  showChevron: boolean;
  onClick: () => void;
  models: ModelOption[] | CodexModelOption[];
  onSelect: (value: string) => void;
}

function ProviderSection({
  active,
  setActive,
  submenuKey,
  label,
  iconClassName,
  showChevron,
  onClick,
  models,
  onSelect,
}: ProviderSectionProps): React.ReactElement<any> {
  const submenu =
    submenuKey === 'claude' ? (
      <ClaudeSubmenu models={models as ModelOption[]} onSelect={onSelect} />
    ) : (
      <CodexSubmenu models={models as CodexModelOption[]} onSelect={onSelect} />
    );

  return (
    <div
      className="relative"
      onMouseEnter={() => setActive(submenuKey)}
      onMouseLeave={() => setActive(null)}
    >
      <MenuRow onClick={onClick}>
        <span className={iconClassName} style={{ fontSize: '10px', lineHeight: 1 }}>
          {submenuKey === 'claude' ? '◆' : '◇'}
        </span>
        <span>{label}</span>
        {showChevron && (
          <span className="ml-auto text-text-semantic-muted">
            <ChevronRightIcon />
          </span>
        )}
      </MenuRow>
      {active === submenuKey && submenu}
    </div>
  );
}

export interface NewTerminalMenuProps {
  anchorRef: React.RefObject<HTMLButtonElement | null>;
  onNew: () => void;
  onNewClaude: (providerModel?: string) => void;
  onNewCodex: (model?: string) => void;
  onClose: () => void;
}

interface NewTerminalMenuItemsProps {
  submenu: 'claude' | 'codex' | null;
  setSubmenu: React.Dispatch<React.SetStateAction<'claude' | 'codex' | null>>;
  claudeModels: ModelOption[];
  codexModels: CodexModelOption[];
  onNew: () => void;
  onNewClaude: (providerModel?: string) => void;
  onNewCodex: (model?: string) => void;
}

function NewTerminalMenuItems(p: NewTerminalMenuItemsProps): React.ReactElement<any> {
  return (
    <>
      <MenuRow onClick={p.onNew}>
        <TerminalIcon />
        <span>Terminal</span>
        <span className="ml-auto text-text-semantic-muted text-[10px] opacity-60">
          Ctrl+Shift+`
        </span>
      </MenuRow>
      <div className="h-px bg-border-semantic my-1" />
      <ProviderSection
        active={p.submenu}
        setActive={p.setSubmenu}
        submenuKey="claude"
        label="Claude Code"
        iconClassName="text-interactive-accent"
        showChevron
        onClick={() => p.onNewClaude()}
        models={p.claudeModels}
        onSelect={p.onNewClaude}
      />
      <ProviderSection
        active={p.submenu}
        setActive={p.setSubmenu}
        submenuKey="codex"
        label="Codex"
        iconClassName="text-[var(--accent-blue,var(--interactive-accent))]"
        showChevron={p.codexModels.length > 0}
        onClick={() => p.onNewCodex()}
        models={p.codexModels}
        onSelect={p.onNewCodex}
      />
    </>
  );
}

export function NewTerminalMenu({
  anchorRef,
  onNew,
  onNewClaude,
  onNewCodex,
  onClose,
}: NewTerminalMenuProps): React.ReactElement<any> | null {
  const menuRef = useRef<HTMLDivElement>(null);
  const [submenu, setSubmenu] = useState<'claude' | 'codex' | null>(null);
  const pos = useMenuPosition(anchorRef);
  const claudeModels = useClaudeModels();
  const codexModels = useCodexModels();
  useMenuDismiss(menuRef, anchorRef, onClose);

  if (!pos) return null;
  return (
    <div
      ref={menuRef}
      role="menu"
      className="fixed z-50 min-w-[200px] rounded border border-border-semantic bg-surface-panel shadow-lg py-1"
      style={{ fontFamily: 'var(--font-ui)', top: pos.top, left: pos.left }}
    >
      <NewTerminalMenuItems
        submenu={submenu}
        setSubmenu={setSubmenu}
        claudeModels={claudeModels}
        codexModels={codexModels}
        onNew={onNew}
        onNewClaude={onNewClaude}
        onNewCodex={onNewCodex}
      />
    </div>
  );
}
