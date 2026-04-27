/**
 * WorkbenchMenuBar — sub-components (Wave 59 Phase C).
 * Extracted from WorkbenchMenuBar.tsx to stay under the 300-line ESLint limit.
 */

import React from 'react';
import { createPortal } from 'react-dom';

import type { MenuDefinition, MenuItem } from '../TitleBar.menus';
import {
  dropdownStyle,
  menuButtonStyle,
  menuItemRowStyle,
  separatorStyle,
} from './WorkbenchMenuBar.styles';

// ── ItemRow ──────────────────────────────────────────────────────────────────

interface ItemRowProps {
  item: MenuItem;
  onClose: () => void;
  isHighlighted: boolean;
  onMouseEnterItem: () => void;
  itemRef: React.Ref<HTMLButtonElement>;
}

export function WorkbenchItemRow({
  item,
  onClose,
  isHighlighted,
  onMouseEnterItem,
  itemRef,
}: ItemRowProps): React.ReactElement {
  if (item.divider) return <div style={separatorStyle} />;
  const bg = isHighlighted
    ? 'color-mix(in srgb, var(--interactive-accent) 15%, transparent)'
    : 'transparent';
  return (
    <button
      ref={itemRef}
      onClick={() => {
        item.action?.();
        onClose();
      }}
      disabled={item.disabled}
      onMouseEnter={onMouseEnterItem}
      className="titlebar-no-drag text-text-semantic-primary"
      style={{
        ...menuItemRowStyle,
        backgroundColor: bg,
        opacity: item.disabled ? 0.4 : 1,
        cursor: item.disabled ? 'default' : 'pointer',
      }}
    >
      <span style={{ flex: 1 }}>{item.label}</span>
      {item.shortcut && (
        <span
          className="text-text-semantic-faint"
          style={{ marginLeft: 'auto', fontSize: '11px', paddingLeft: '24px' }}
        >
          {item.shortcut}
        </span>
      )}
    </button>
  );
}

// ── Dropdown ─────────────────────────────────────────────────────────────────

interface DropdownProps {
  menu: MenuDefinition;
  onClose: () => void;
  highlightedIndex: number;
  onHighlight: (idx: number) => void;
  itemRefs: React.MutableRefObject<(HTMLButtonElement | null)[]>;
  anchorRect: DOMRect | null;
  dropdownRef: React.RefObject<HTMLDivElement | null>;
}

export function WorkbenchDropdown({
  menu,
  onClose,
  highlightedIndex,
  onHighlight,
  itemRefs,
  anchorRect,
  dropdownRef,
}: DropdownProps): React.ReactElement {
  const top = anchorRect?.bottom ?? 0;
  const left = anchorRect?.left ?? 0;
  return createPortal(
    <div
      ref={dropdownRef}
      role="menu"
      className="titlebar-no-drag bg-surface-overlay border border-border-semantic"
      style={{ ...dropdownStyle, position: 'fixed', top, left }}
    >
      {menu.items.map((item: MenuItem, i: number) => (
        <WorkbenchItemRow
          key={item.divider ? `sep-${i}` : item.label}
          item={item}
          onClose={onClose}
          isHighlighted={i === highlightedIndex}
          onMouseEnterItem={() => onHighlight(i)}
          itemRef={(el) => {
            itemRefs.current[i] = el;
          }}
        />
      ))}
    </div>,
    document.body,
  );
}

// ── MenuButton ───────────────────────────────────────────────────────────────

interface MenuButtonProps {
  label: string;
  isOpen: boolean;
  onClick: () => void;
  onHover: () => void;
  buttonRef?: React.Ref<HTMLButtonElement>;
}

function applyHoverStyle(target: HTMLButtonElement): void {
  target.style.color = 'var(--text-primary)';
  target.style.backgroundColor = 'var(--surface-hover)';
}

function clearHoverStyle(target: HTMLButtonElement): void {
  target.style.color = '';
  target.style.backgroundColor = 'transparent';
}

export function WorkbenchMenuButton({
  label,
  isOpen,
  onClick,
  onHover,
  buttonRef,
}: MenuButtonProps): React.ReactElement {
  return (
    <button
      ref={buttonRef}
      className="titlebar-no-drag text-text-semantic-secondary"
      aria-haspopup="menu"
      aria-expanded={isOpen}
      onClick={onClick}
      style={{
        ...menuButtonStyle,
        background: isOpen ? 'var(--surface-raised)' : 'transparent',
        color: isOpen ? 'var(--text-primary)' : undefined,
      }}
      onMouseEnter={(e) => {
        onHover();
        if (!isOpen) applyHoverStyle(e.currentTarget);
      }}
      onMouseLeave={(e) => {
        if (!isOpen) clearHoverStyle(e.currentTarget);
      }}
    >
      {label}
    </button>
  );
}
