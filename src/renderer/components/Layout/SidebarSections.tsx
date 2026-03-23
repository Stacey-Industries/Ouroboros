/**
 * SidebarSections — Stacked sidebar panel container.
 *
 * Replaces bare `<SidebarFileTree />` in the sidebar children slot,
 * adding collapsible Explorer, Outline, Timeline, and Bookmarks sections.
 */

import React, { useCallback, useRef, useState } from 'react';

import { BookmarksSection, useBookmarkCount } from './BookmarksSection';
import { OutlineSection, useOutlineSymbolCount } from './OutlineSection';
import { SidebarFileTree } from './SidebarFileTree';
import { SidebarSection } from './SidebarSection';
import { TimelineSection } from './TimelineSection';

// ── Persisted state hook ──────────────────────────────────────────────────────

function usePersistedState<T>(key: string, defaultValue: T): [T, (value: T | ((prev: T) => T)) => void] {
  const [state, setState] = useState<T>(() => {
    try {
      const stored = localStorage.getItem(key);
      return stored ? (JSON.parse(stored) as T) : defaultValue;
    } catch {
      return defaultValue;
    }
  });

  const setPersistedState = useCallback(
    (value: T | ((prev: T) => T)) => {
      setState((prev) => {
        const next = typeof value === 'function' ? (value as (prev: T) => T)(prev) : value;
        localStorage.setItem(key, JSON.stringify(next));
        return next;
      });
    },
    [key],
  );

  return [state, setPersistedState];
}

// ── Section collapse state ────────────────────────────────────────────────────

interface CollapseState {
  explorer: boolean;
  outline: boolean;
  timeline: boolean;
  bookmarks: boolean;
}

const DEFAULT_COLLAPSE: CollapseState = {
  explorer: false,
  outline: false,
  timeline: true,
  bookmarks: true,
};

// ── Resize divider ────────────────────────────────────────────────────────────

interface SidebarResizeDividerProps {
  onDrag: (deltaRatio: number) => void;
  containerRef: React.RefObject<HTMLDivElement | null>;
}

function SidebarResizeDivider({ onDrag, containerRef }: SidebarResizeDividerProps): React.ReactElement {
  const startYRef = useRef(0);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      startYRef.current = e.clientY;

      const handlePointerMove = (ev: PointerEvent): void => {
        const container = containerRef.current;
        if (!container) return;
        const containerHeight = container.clientHeight;
        if (containerHeight <= 0) return;
        const deltaY = ev.clientY - startYRef.current;
        startYRef.current = ev.clientY;
        onDrag(deltaY / containerHeight);
      };

      const handlePointerUp = (): void => {
        window.removeEventListener('pointermove', handlePointerMove);
        window.removeEventListener('pointerup', handlePointerUp);
      };

      window.addEventListener('pointermove', handlePointerMove);
      window.addEventListener('pointerup', handlePointerUp);
    },
    [containerRef, onDrag],
  );

  return (
    <div
      className="group relative flex-shrink-0 cursor-row-resize w-full select-none z-10"
      style={{ height: '3px', touchAction: 'none' }}
      onPointerDown={handlePointerDown}
      role="separator"
      aria-orientation="horizontal"
      aria-label="Resize sections"
    >
      <div className="absolute inset-x-0 -top-1 -bottom-1" />
      <div className="absolute inset-x-0 top-[1px] h-[1px] bg-border-semantic opacity-0 transition-all duration-150 group-hover:opacity-100 group-hover:bg-interactive-accent group-active:opacity-100 group-active:bg-interactive-accent" />
    </div>
  );
}

// ── Toggle helpers ────────────────────────────────────────────────────────────

function useSectionToggles(setCollapsed: (fn: (prev: CollapseState) => CollapseState) => void) {
  const toggle = useCallback((key: keyof CollapseState) => {
    setCollapsed((prev) => ({ ...prev, [key]: !prev[key] }));
  }, [setCollapsed]);
  return {
    toggleExplorer: useCallback(() => toggle('explorer'), [toggle]),
    toggleOutline: useCallback(() => toggle('outline'), [toggle]),
    toggleTimeline: useCallback(() => toggle('timeline'), [toggle]),
    toggleBookmarks: useCallback(() => toggle('bookmarks'), [toggle]),
  };
}

// ── Sections JSX ──────────────────────────────────────────────────────────────

function SidebarSectionsLayout({ collapsed, explorerFlex, outlineFlex, showDivider, handleDrag, containerRef, symbolCount, bookmarkCount, toggles }: {
  collapsed: CollapseState; explorerFlex: number; outlineFlex: number; showDivider: boolean;
  handleDrag: (dr: number) => void; containerRef: React.RefObject<HTMLDivElement | null>;
  symbolCount: number; bookmarkCount: number;
  toggles: ReturnType<typeof useSectionToggles>;
}): React.ReactElement {
  return (
    <div ref={containerRef} className="flex flex-col h-full overflow-hidden">
      <SidebarSection title="Explorer" collapsed={collapsed.explorer} onToggle={toggles.toggleExplorer}
        style={{ flex: explorerFlex, minHeight: collapsed.explorer ? undefined : 100 }}>
        <SidebarFileTree />
      </SidebarSection>
      {showDivider && <SidebarResizeDivider onDrag={handleDrag} containerRef={containerRef} />}
      <SidebarSection title="Outline" collapsed={collapsed.outline} onToggle={toggles.toggleOutline}
        badge={symbolCount} style={{ flex: outlineFlex, minHeight: collapsed.outline ? undefined : 80 }}>
        <OutlineSection />
      </SidebarSection>
      <SidebarSection title="Timeline" collapsed={collapsed.timeline} onToggle={toggles.toggleTimeline}>
        <TimelineSection />
      </SidebarSection>
      <SidebarSection title="Bookmarks" collapsed={collapsed.bookmarks} onToggle={toggles.toggleBookmarks} badge={bookmarkCount}>
        <BookmarksSection />
      </SidebarSection>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function SidebarSections(): React.ReactElement {
  const [collapsed, setCollapsed] = usePersistedState<CollapseState>('agent-ide:sidebar-sections', DEFAULT_COLLAPSE);
  const [explorerRatio, setExplorerRatio] = usePersistedState<number>('agent-ide:sidebar-explorer-ratio', 0.6);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const symbolCount = useOutlineSymbolCount();
  const bookmarkCount = useBookmarkCount();
  const toggles = useSectionToggles(setCollapsed);
  const handleDrag = useCallback((deltaRatio: number) => {
    setExplorerRatio((prev) => Math.min(0.85, Math.max(0.15, prev + deltaRatio)));
  }, [setExplorerRatio]);

  return (
    <SidebarSectionsLayout collapsed={collapsed}
      explorerFlex={collapsed.outline ? 1 : explorerRatio}
      outlineFlex={collapsed.explorer ? 1 : 1 - explorerRatio}
      showDivider={!collapsed.explorer && !collapsed.outline}
      handleDrag={handleDrag} containerRef={containerRef}
      symbolCount={symbolCount} bookmarkCount={bookmarkCount} toggles={toggles} />
  );
}
