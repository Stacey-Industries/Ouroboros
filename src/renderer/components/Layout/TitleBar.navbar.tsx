import React, { useCallback, useEffect, useRef, useState } from 'react';

import type { MenuDefinition, MenuItem } from './TitleBar.menus';
import { getMenuDefinitions } from './TitleBar.menus';

export const menuItemRowStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', width: '100%', height: '28px', padding: '0 12px', border: 'none', background: 'none', cursor: 'pointer', fontSize: '12px', fontFamily: 'var(--font-ui, sans-serif)', transition: 'background-color 80ms ease', gap: '16px', textAlign: 'left', lineHeight: '28px', whiteSpace: 'nowrap' };
export const menuItemShortcutStyle: React.CSSProperties = { marginLeft: 'auto', fontSize: '11px', fontFamily: 'var(--font-mono, monospace)', letterSpacing: '0.01em', flexShrink: 0, paddingLeft: '24px' };
export const separatorStyle: React.CSSProperties = { height: '1px', backgroundColor: 'var(--border-semantic)', margin: '4px 8px' };
export const dropdownStyle: React.CSSProperties = { position: 'absolute', top: '100%', left: 0, minWidth: '220px', padding: '4px 0', borderRadius: '6px', boxShadow: '0 4px 12px rgba(0,0,0,0.3)', zIndex: 1000 };
const menuButtonStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', height: '100%', padding: '0 10px', border: 'none', background: 'transparent', color: 'var(--text-secondary)', fontSize: '12px', fontFamily: 'var(--font-ui, sans-serif)', cursor: 'pointer', transition: 'color 100ms ease, background-color 100ms ease', whiteSpace: 'nowrap' };

export function MenuItemRow({
  item,
  onClose,
  isHighlighted,
  onMouseEnterItem,
  itemRef,
}: {
  item: MenuItem;
  onClose: () => void;
  isHighlighted: boolean;
  onMouseEnterItem: () => void;
  itemRef: React.Ref<HTMLButtonElement>;
}): React.ReactElement {
  if (item.divider) return <div style={separatorStyle} />;
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
      style={{ ...menuItemRowStyle, backgroundColor: isHighlighted ? 'color-mix(in srgb, var(--interactive-accent) 15%, transparent)' : 'transparent', opacity: item.disabled ? 0.4 : 1, cursor: item.disabled ? 'default' : 'pointer' }}
    >
      <span style={{ flex: 1 }}>{item.label}</span>
      {item.shortcut && <span className="text-text-semantic-faint" style={menuItemShortcutStyle}>{item.shortcut}</span>}
    </button>
  );
}

function DropdownMenu({
  menu,
  onClose,
  highlightedIndex,
  onHighlight,
  itemRefs,
}: {
  menu: MenuDefinition;
  onClose: () => void;
  highlightedIndex: number;
  onHighlight: (idx: number) => void;
  itemRefs: React.MutableRefObject<(HTMLButtonElement | null)[]>;
}): React.ReactElement {
  return <div className="titlebar-no-drag bg-surface-panel border border-border-semantic" style={dropdownStyle}>{menu.items.map((item, i) => <MenuItemRow key={item.divider ? `sep-${i}` : item.label} item={item} onClose={onClose} isHighlighted={i === highlightedIndex} onMouseEnterItem={() => onHighlight(i)} itemRef={(el) => { itemRefs.current[i] = el; }} />)}</div>;
}

function NavbarMenuButton({
  label,
  isOpen,
  onClick,
  onHover,
}: {
  label: string;
  isOpen: boolean;
  onClick: () => void;
  onHover: () => void;
}): React.ReactElement {
  return <button className="titlebar-no-drag" style={{ ...menuButtonStyle, background: isOpen ? 'var(--surface-raised)' : 'transparent', color: isOpen ? 'var(--text-primary)' : 'var(--text-secondary)' }} onClick={onClick} onMouseEnter={(e) => { onHover(); if (!isOpen) { e.currentTarget.style.color = 'var(--text-primary)'; e.currentTarget.style.backgroundColor = 'rgba(128,128,128,0.1)'; } }} onMouseLeave={(e) => { if (!isOpen) { e.currentTarget.style.color = ''; e.currentTarget.style.backgroundColor = 'transparent'; } }}>{label}</button>;
}

interface NavbarKeyboardArgs {
  openMenuIndex: number | null;
  highlightedItem: number;
  menus: MenuDefinition[];
  setOpenMenuIndex: (value: ((current: number | null) => number | null) | number | null) => void;
  setHighlightedItem: (value: number) => void;
  itemRefs: React.MutableRefObject<(HTMLButtonElement | null)[]>;
}

function findNextItemIndex(items: MenuDefinition['items'], highlightedItem: number, step: 1 | -1): number {
  let next = highlightedItem;
  do { next = (next + step + items.length) % items.length; } while (items[next]?.divider && next !== highlightedItem);
  return next;
}

function moveAdjacentMenu({
  openMenuIndex,
  menus,
  setOpenMenuIndex,
  setHighlightedItem,
  delta,
}: {
  openMenuIndex: number;
  menus: MenuDefinition[];
  setOpenMenuIndex: (value: number | null) => void;
  setHighlightedItem: (value: number) => void;
  delta: 1 | -1;
}): void {
  setOpenMenuIndex((openMenuIndex + delta + menus.length) % menus.length);
  setHighlightedItem(-1);
}

function handleMenuArrowKey(
  e: KeyboardEvent,
  args: NavbarKeyboardArgs,
  currentMenu: MenuDefinition,
): boolean {
  const { openMenuIndex, menus, setOpenMenuIndex, setHighlightedItem, highlightedItem, itemRefs } = args;
  if (e.key === 'ArrowLeft') {
    e.preventDefault();
    moveAdjacentMenu({ openMenuIndex: openMenuIndex ?? 0, menus, setOpenMenuIndex, setHighlightedItem, delta: -1 });
    return true;
  }
  if (e.key === 'ArrowRight') {
    e.preventDefault();
    moveAdjacentMenu({ openMenuIndex: openMenuIndex ?? 0, menus, setOpenMenuIndex, setHighlightedItem, delta: 1 });
    return true;
  }
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    const next = findNextItemIndex(currentMenu.items, highlightedItem, e.key === 'ArrowDown' ? 1 : -1);
    setHighlightedItem(next);
    itemRefs.current[next]?.scrollIntoView?.({ block: 'nearest' });
    return true;
  }
  return false;
}

function handleMenuEnterKey(
  e: KeyboardEvent,
  args: NavbarKeyboardArgs,
  currentMenu: MenuDefinition,
): boolean {
  if (e.key !== 'Enter') return false;
  const item = currentMenu.items[args.highlightedItem];
  if (item && !item.divider && !item.disabled) {
    e.preventDefault();
    item.action?.();
    args.setOpenMenuIndex(null);
    args.setHighlightedItem(-1);
  }
  return true;
}

function handleMenuKeyDown(e: KeyboardEvent, args: NavbarKeyboardArgs): void {
  if (e.key === 'Alt' && !e.ctrlKey && !e.shiftKey) {
    e.preventDefault();
    args.setOpenMenuIndex((prev) => {
      args.setHighlightedItem(-1);
      return prev !== null ? null : 0;
    });
    return;
  }
  if (e.key === 'Escape') {
    if (args.openMenuIndex !== null) {
      e.preventDefault();
      args.setOpenMenuIndex(null);
      args.setHighlightedItem(-1);
    }
    return;
  }
  if (args.openMenuIndex === null) return;
  const currentMenu = args.menus[args.openMenuIndex];
  if (!currentMenu) return;
  if (handleMenuArrowKey(e, args, currentMenu)) return;
  handleMenuEnterKey(e, args, currentMenu);
}

function useNavbarKeyboard(args: NavbarKeyboardArgs): void {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => handleMenuKeyDown(e, args);
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [args]);
}

export function NavbarMenus(): React.ReactElement {
  const [openMenuIndex, setOpenMenuIndex] = useState<number | null>(null);
  const [highlightedItem, setHighlightedItem] = useState<number>(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const menus = getMenuDefinitions();

  const handleMenuClick = useCallback((idx: number) => {
    setOpenMenuIndex((prev) => {
      if (prev === idx) return null;
      setHighlightedItem(-1);
      return idx;
    });
  }, []);

  const handleMenuHover = useCallback((idx: number) => {
    if (openMenuIndex !== null) {
      setOpenMenuIndex(idx);
      setHighlightedItem(-1);
    }
  }, [openMenuIndex]);

  const closeMenu = useCallback(() => {
    setOpenMenuIndex(null);
    setHighlightedItem(-1);
  }, []);

  useEffect(() => {
    if (openMenuIndex === null) return;
    const handleClickOutside = (e: MouseEvent): void => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) closeMenu();
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [closeMenu, openMenuIndex]);

  useNavbarKeyboard({ openMenuIndex, highlightedItem, menus, setOpenMenuIndex, setHighlightedItem, itemRefs });

  return <div ref={containerRef} className="titlebar-no-drag" style={{ display: 'flex', alignItems: 'stretch', height: '100%' }}>{menus.map((menu, idx) => <div key={menu.label} style={{ position: 'relative' }}><NavbarMenuButton label={menu.label} isOpen={openMenuIndex === idx} onClick={() => handleMenuClick(idx)} onHover={() => handleMenuHover(idx)} />{openMenuIndex === idx && <DropdownMenu menu={menu} onClose={closeMenu} highlightedIndex={highlightedItem} onHighlight={setHighlightedItem} itemRefs={itemRefs} />}</div>)}</div>;
}
