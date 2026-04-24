import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { useImmersiveChatFlag } from '../../hooks/useImmersiveChatFlag';
import type { MenuDefinition, MenuItem } from './TitleBar.menus';
import { getMenuDefinitions } from './TitleBar.menus';

export const menuItemRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  width: '100%',
  height: '28px',
  padding: '0 12px',
  border: 'none',
  background: 'none',
  cursor: 'pointer',
  fontSize: '12px',
  fontFamily: 'var(--font-ui, sans-serif)',
  transition: 'background-color 80ms ease',
  gap: '16px',
  textAlign: 'left',
  lineHeight: '28px',
  whiteSpace: 'nowrap',
};
export const menuItemShortcutStyle: React.CSSProperties = {
  marginLeft: 'auto',
  fontSize: '11px',
  fontFamily: 'var(--font-mono, monospace)',
  letterSpacing: '0.01em',
  flexShrink: 0,
  paddingLeft: '24px',
};
export const separatorStyle: React.CSSProperties = {
  height: '1px',
  backgroundColor: 'var(--border-semantic)',
  margin: '4px 8px',
};
export const dropdownStyle: React.CSSProperties = {
  minWidth: '220px',
  padding: '4px 0',
  borderRadius: '6px',
  boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
  zIndex: 1000,
  backdropFilter: 'blur(24px) saturate(140%)',
  WebkitBackdropFilter: 'blur(24px) saturate(140%)',
  ...({ WebkitAppRegion: 'no-drag' } as React.CSSProperties),
};
const menuButtonStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  height: '100%',
  padding: '0 10px',
  border: 'none',
  background: 'transparent',
  color: 'var(--text-secondary)',
  fontSize: '12px',
  fontFamily: 'var(--font-ui, sans-serif)',
  cursor: 'pointer',
  transition: 'color 100ms ease, background-color 100ms ease',
  whiteSpace: 'nowrap',
};

interface MenuItemRowProps {
  item: MenuItem; onClose: () => void; isHighlighted: boolean;
  onMouseEnterItem: () => void; itemRef: React.Ref<HTMLButtonElement>;
}

export function MenuItemRow({ item, onClose, isHighlighted, onMouseEnterItem, itemRef }: MenuItemRowProps): React.ReactElement {
  if (item.divider) return <div style={separatorStyle} />;
  const bgColor = isHighlighted ? 'color-mix(in srgb, var(--interactive-accent) 15%, transparent)' : 'transparent';
  return (
    <button ref={itemRef} onClick={() => { item.action?.(); onClose(); }} disabled={item.disabled}
      onMouseEnter={onMouseEnterItem} className="titlebar-no-drag text-text-semantic-primary"
      style={{ ...menuItemRowStyle, backgroundColor: bgColor, opacity: item.disabled ? 0.4 : 1, cursor: item.disabled ? 'default' : 'pointer' }}
    >
      <span style={{ flex: 1 }}>{item.label}</span>
      {item.shortcut && <span className="text-text-semantic-faint" style={menuItemShortcutStyle}>{item.shortcut}</span>}
    </button>
  );
}

interface DropdownMenuProps {
  menu: MenuDefinition; onClose: () => void; highlightedIndex: number;
  onHighlight: (idx: number) => void; itemRefs: React.MutableRefObject<(HTMLButtonElement | null)[]>;
  anchorRect: DOMRect | null; dropdownRef: React.RefObject<HTMLDivElement | null>;
}

function DropdownMenu({ menu, onClose, highlightedIndex, onHighlight, itemRefs, anchorRect, dropdownRef }: DropdownMenuProps): React.ReactElement {
  if (!anchorRect) return <></>;
  return createPortal(
    <div ref={dropdownRef} className="titlebar-no-drag bg-surface-overlay border border-border-semantic"
      style={{ ...dropdownStyle, position: 'fixed', top: anchorRect.bottom, left: anchorRect.left }}
    >
      {menu.items.map((item, i) => (
        <MenuItemRow key={item.divider ? `sep-${i}` : item.label} item={item} onClose={onClose}
          isHighlighted={i === highlightedIndex} onMouseEnterItem={() => onHighlight(i)}
          itemRef={(el) => { itemRefs.current[i] = el; }}
        />
      ))}
    </div>,
    document.body,
  );
}

function NavbarMenuButton({ label, isOpen, onClick, onHover, buttonRef }: {
  label: string; isOpen: boolean; onClick: () => void; onHover: () => void; buttonRef?: React.Ref<HTMLButtonElement>;
}): React.ReactElement {
  return (
    <button ref={buttonRef} className="titlebar-no-drag"
      style={{ ...menuButtonStyle, background: isOpen ? 'var(--surface-raised)' : 'transparent', color: isOpen ? 'var(--text-primary)' : 'var(--text-secondary)' }}
      onClick={onClick}
      onMouseEnter={(e) => { onHover(); if (!isOpen) { e.currentTarget.style.color = 'var(--text-primary)'; e.currentTarget.style.backgroundColor = 'rgba(128,128,128,0.1)'; } }}
      onMouseLeave={(e) => { if (!isOpen) { e.currentTarget.style.color = ''; e.currentTarget.style.backgroundColor = 'transparent'; } }}
    >
      {label}
    </button>
  );
}

interface NavbarKeyboardArgs {
  openMenuIndex: number | null;
  highlightedItem: number;
  menus: MenuDefinition[];
  setOpenMenuIndex: (value: ((current: number | null) => number | null) | number | null) => void;
  setHighlightedItem: (value: number) => void;
  itemRefs: React.MutableRefObject<(HTMLButtonElement | null)[]>;
}

function findNextItemIndex(
  items: MenuDefinition['items'],
  highlightedItem: number,
  step: 1 | -1,
): number {
  let next = highlightedItem;
  do {
    next = (next + step + items.length) % items.length;
  } while (items[next]?.divider && next !== highlightedItem);
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

function handleMenuArrowKey(e: KeyboardEvent, args: NavbarKeyboardArgs, currentMenu: MenuDefinition): boolean {
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

interface NavbarMenuStateResult {
  openMenuIndex: number | null;
  highlightedItem: number;
  setHighlightedItem: (v: number) => void;
  containerRef: React.RefObject<HTMLDivElement | null>;
  dropdownRef: React.RefObject<HTMLDivElement | null>;
  buttonRefs: React.MutableRefObject<(HTMLButtonElement | null)[]>;
  itemRefs: React.MutableRefObject<(HTMLButtonElement | null)[]>;
  anchorRect: DOMRect | null;
  handleMenuClick: (idx: number) => void;
  handleMenuHover: (idx: number) => void;
  closeMenu: () => void;
}

interface NavbarMenuEffectsArgs {
  openMenuIndex: number | null;
  updateAnchorRect: () => void;
  closeMenu: () => void;
  containerRef: React.RefObject<HTMLDivElement | null>;
  dropdownRef: React.RefObject<HTMLDivElement | null>;
}

function useNavbarMenuEffects(args: NavbarMenuEffectsArgs): void {
  const { openMenuIndex, updateAnchorRect, closeMenu, containerRef, dropdownRef } = args;
  useEffect(() => {
    if (openMenuIndex === null) return;
    const onDown = (e: MouseEvent): void => {
      const t = e.target as Node;
      if (!containerRef.current?.contains(t) && !dropdownRef.current?.contains(t)) closeMenu();
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [closeMenu, containerRef, dropdownRef, openMenuIndex]);
  useEffect(() => {
    if (openMenuIndex === null) return;
    updateAnchorRect();
    window.addEventListener('resize', updateAnchorRect);
    window.addEventListener('scroll', updateAnchorRect, true);
    return () => {
      window.removeEventListener('resize', updateAnchorRect);
      window.removeEventListener('scroll', updateAnchorRect, true);
    };
  }, [openMenuIndex, updateAnchorRect]);
}

function useNavbarMenuState(menus: MenuDefinition[]): NavbarMenuStateResult {
  const [openMenuIndex, setOpenMenuIndex] = useState<number | null>(null);
  const [highlightedItem, setHighlightedItem] = useState<number>(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  const updateAnchorRect = useCallback(() => {
    if (openMenuIndex === null) { setAnchorRect(null); return; }
    setAnchorRect(buttonRefs.current[openMenuIndex]?.getBoundingClientRect() ?? null);
  }, [openMenuIndex]);
  const closeMenu = useCallback(() => { setOpenMenuIndex(null); setHighlightedItem(-1); }, []);
  const handleMenuClick = useCallback((idx: number) => {
    setOpenMenuIndex((prev) => { if (prev === idx) return null; setHighlightedItem(-1); return idx; });
  }, []);
  const handleMenuHover = useCallback((idx: number) => {
    if (openMenuIndex !== null) { setOpenMenuIndex(idx); setHighlightedItem(-1); }
  }, [openMenuIndex]);
  useNavbarMenuEffects({ openMenuIndex, updateAnchorRect, closeMenu, containerRef, dropdownRef });
  useNavbarKeyboard({ openMenuIndex, highlightedItem, menus, setOpenMenuIndex, setHighlightedItem, itemRefs });
  return { openMenuIndex, highlightedItem, setHighlightedItem, containerRef, dropdownRef, buttonRefs, itemRefs, anchorRect, handleMenuClick, handleMenuHover, closeMenu };
}

export function NavbarMenus(): React.ReactElement {
  const isImmersiveChat = useImmersiveChatFlag();
  const menus = getMenuDefinitions(isImmersiveChat);
  const { openMenuIndex, highlightedItem, setHighlightedItem, containerRef, dropdownRef, buttonRefs, itemRefs, anchorRect, handleMenuClick, handleMenuHover, closeMenu } = useNavbarMenuState(menus);
  return (
    <div ref={containerRef} className="titlebar-no-drag" style={{ display: 'flex', alignItems: 'stretch', height: '100%' }}>
      {menus.map((menu, idx) => (
        <div key={menu.label}>
          <NavbarMenuButton label={menu.label} isOpen={openMenuIndex === idx}
            onClick={() => handleMenuClick(idx)} onHover={() => handleMenuHover(idx)}
            buttonRef={(el: HTMLButtonElement | null) => { buttonRefs.current[idx] = el; }}
          />
          {openMenuIndex === idx && (
            <DropdownMenu menu={menu} onClose={closeMenu} highlightedIndex={highlightedItem}
              onHighlight={setHighlightedItem} itemRefs={itemRefs} anchorRect={anchorRect} dropdownRef={dropdownRef}
            />
          )}
        </div>
      ))}
    </div>
  );
}
