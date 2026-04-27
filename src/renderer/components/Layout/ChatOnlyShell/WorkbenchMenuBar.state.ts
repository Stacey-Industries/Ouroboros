/**
 * WorkbenchMenuBar — keyboard handlers + state hook (Wave 59 Phase C).
 * Extracted from WorkbenchMenuBar.tsx to stay under the 300-line ESLint limit.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';

import type { MenuDefinition, MenuItem } from '../TitleBar.menus';
import { ALT_KEY_MAP } from './WorkbenchMenuBar.styles';

// ── Index helpers ─────────────────────────────────────────────────────────────

function findNextIdx(items: MenuItem[], current: number, step: 1 | -1): number {
  let next = current;
  do {
    next = (next + step + items.length) % items.length;
  } while (items[next]?.divider && next !== current);
  return next;
}

// ── Keyboard handlers ─────────────────────────────────────────────────────────

interface KeyboardArgs {
  openIdx: number | null;
  highlighted: number;
  menus: MenuDefinition[];
  setOpenIdx: (v: number | null) => void;
  setHighlighted: (v: number) => void;
  itemRefs: React.MutableRefObject<(HTMLButtonElement | null)[]>;
  closeMenu: () => void;
}

function handleAltKey(e: KeyboardEvent, args: KeyboardArgs): boolean {
  if (!e.altKey || e.ctrlKey || e.shiftKey || e.key.length !== 1) return false;
  const idx = ALT_KEY_MAP[e.key.toLowerCase()];
  if (idx === undefined) return false;
  e.preventDefault();
  args.setHighlighted(-1);
  args.setOpenIdx(args.openIdx === idx ? null : idx);
  return true;
}

function handleHorizontalArrow(e: KeyboardEvent, args: KeyboardArgs): void {
  const delta = e.key === 'ArrowLeft' ? -1 : 1;
  args.setOpenIdx(((args.openIdx ?? 0) + delta + args.menus.length) % args.menus.length);
  args.setHighlighted(-1);
}

function handleVerticalArrow(
  e: KeyboardEvent,
  args: KeyboardArgs,
  currentMenu: MenuDefinition,
): void {
  const next = findNextIdx(currentMenu.items, args.highlighted, e.key === 'ArrowDown' ? 1 : -1);
  args.setHighlighted(next);
  args.itemRefs.current[next]?.scrollIntoView?.({ block: 'nearest' });
}

function handleArrowKey(
  e: KeyboardEvent,
  args: KeyboardArgs,
  currentMenu: MenuDefinition,
): boolean {
  const k = e.key;
  if (k !== 'ArrowLeft' && k !== 'ArrowRight' && k !== 'ArrowDown' && k !== 'ArrowUp') return false;
  e.preventDefault();
  if (k === 'ArrowLeft' || k === 'ArrowRight') handleHorizontalArrow(e, args);
  else handleVerticalArrow(e, args, currentMenu);
  return true;
}

function handleEnterKey(e: KeyboardEvent, args: KeyboardArgs, currentMenu: MenuDefinition): void {
  if (e.key !== 'Enter') return;
  const item = currentMenu.items[args.highlighted];
  if (item && !item.divider && !item.disabled) {
    e.preventDefault();
    item.action?.();
    args.closeMenu();
  }
}

export function buildKeyHandler(args: KeyboardArgs): (e: KeyboardEvent) => void {
  return (e: KeyboardEvent): void => {
    if (handleAltKey(e, args)) return;
    if (e.key === 'Escape' && args.openIdx !== null) {
      e.preventDefault();
      args.closeMenu();
      return;
    }
    if (args.openIdx === null) return;
    const currentMenu = args.menus[args.openIdx];
    if (!currentMenu) return;
    if (!handleArrowKey(e, args, currentMenu)) handleEnterKey(e, args, currentMenu);
  };
}

// ── Effect hooks ──────────────────────────────────────────────────────────────

export function useMenuAnchorEffect(openIdx: number | null, updateAnchor: () => void): void {
  useEffect(() => {
    if (openIdx === null) return;
    updateAnchor();
    window.addEventListener('resize', updateAnchor);
    window.addEventListener('scroll', updateAnchor, true);
    return () => {
      window.removeEventListener('resize', updateAnchor);
      window.removeEventListener('scroll', updateAnchor, true);
    };
  }, [openIdx, updateAnchor]);
}

export function useMenuOutsideClick(
  openIdx: number | null,
  containerRef: React.RefObject<HTMLDivElement | null>,
  dropdownRef: React.RefObject<HTMLDivElement | null>,
  closeMenu: () => void,
): void {
  useEffect(() => {
    if (openIdx === null) return;
    const onDown = (e: MouseEvent): void => {
      const t = e.target as Node;
      if (!containerRef.current?.contains(t) && !dropdownRef.current?.contains(t)) closeMenu();
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [closeMenu, containerRef, dropdownRef, openIdx]);
}

// ── State hook (split into refs / position / callbacks) ───────────────────────

interface MenuRefs {
  containerRef: React.RefObject<HTMLDivElement | null>;
  dropdownRef: React.RefObject<HTMLDivElement | null>;
  buttonRefs: React.MutableRefObject<(HTMLButtonElement | null)[]>;
  itemRefs: React.MutableRefObject<(HTMLButtonElement | null)[]>;
}

function useMenuRefs(): MenuRefs {
  const containerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  return { containerRef, dropdownRef, buttonRefs, itemRefs };
}

interface PositionState {
  openIdx: number | null;
  setOpenIdx: React.Dispatch<React.SetStateAction<number | null>>;
  highlighted: number;
  setHighlighted: React.Dispatch<React.SetStateAction<number>>;
  anchorRect: DOMRect | null;
  setAnchorRect: React.Dispatch<React.SetStateAction<DOMRect | null>>;
}

function usePositionState(): PositionState {
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  const [highlighted, setHighlighted] = useState(-1);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  return { openIdx, setOpenIdx, highlighted, setHighlighted, anchorRect, setAnchorRect };
}

interface MenuCallbacks {
  closeMenu: () => void;
  updateAnchor: () => void;
  handleClick: (idx: number) => void;
  handleHover: (idx: number) => void;
}

function useMenuCallbacks(state: PositionState, refs: MenuRefs): MenuCallbacks {
  const { openIdx, setOpenIdx, setHighlighted, setAnchorRect } = state;
  const closeMenu = useCallback(() => {
    setOpenIdx(null);
    setHighlighted(-1);
  }, [setOpenIdx, setHighlighted]);
  const updateAnchor = useCallback(() => {
    if (openIdx === null) {
      setAnchorRect(null);
      return;
    }
    setAnchorRect(refs.buttonRefs.current[openIdx]?.getBoundingClientRect() ?? null);
  }, [openIdx, refs.buttonRefs, setAnchorRect]);
  const handleClick = useCallback(
    (idx: number) => {
      setOpenIdx((prev) => (prev === idx ? null : idx));
      setHighlighted(-1);
    },
    [setOpenIdx, setHighlighted],
  );
  const handleHover = useCallback(
    (idx: number) => {
      if (openIdx !== null) {
        setOpenIdx(idx);
        setHighlighted(-1);
      }
    },
    [openIdx, setOpenIdx, setHighlighted],
  );
  return { closeMenu, updateAnchor, handleClick, handleHover };
}

export interface MenuBarState {
  openIdx: number | null;
  highlighted: number;
  setHighlighted: (v: number) => void;
  containerRef: React.RefObject<HTMLDivElement | null>;
  dropdownRef: React.RefObject<HTMLDivElement | null>;
  buttonRefs: React.MutableRefObject<(HTMLButtonElement | null)[]>;
  itemRefs: React.MutableRefObject<(HTMLButtonElement | null)[]>;
  anchorRect: DOMRect | null;
  handleClick: (idx: number) => void;
  handleHover: (idx: number) => void;
  closeMenu: () => void;
}

function useKeyboardListener(
  state: PositionState,
  refs: MenuRefs,
  callbacks: MenuCallbacks,
  menus: MenuDefinition[],
): void {
  useEffect(() => {
    const handler = buildKeyHandler({
      openIdx: state.openIdx,
      highlighted: state.highlighted,
      menus,
      setOpenIdx: state.setOpenIdx,
      setHighlighted: state.setHighlighted,
      itemRefs: refs.itemRefs,
      closeMenu: callbacks.closeMenu,
    });
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [state, refs, callbacks, menus]);
}

export function useWorkbenchMenuBarState(menus: MenuDefinition[]): MenuBarState {
  const refs = useMenuRefs();
  const state = usePositionState();
  const callbacks = useMenuCallbacks(state, refs);
  useMenuOutsideClick(state.openIdx, refs.containerRef, refs.dropdownRef, callbacks.closeMenu);
  useMenuAnchorEffect(state.openIdx, callbacks.updateAnchor);
  useKeyboardListener(state, refs, callbacks, menus);
  return {
    openIdx: state.openIdx,
    highlighted: state.highlighted,
    setHighlighted: state.setHighlighted,
    containerRef: refs.containerRef,
    dropdownRef: refs.dropdownRef,
    buttonRefs: refs.buttonRefs,
    itemRefs: refs.itemRefs,
    anchorRect: state.anchorRect,
    handleClick: callbacks.handleClick,
    handleHover: callbacks.handleHover,
    closeMenu: callbacks.closeMenu,
  };
}
