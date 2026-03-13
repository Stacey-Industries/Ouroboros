import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FileMatchItem, VisibleFileMatchItem } from './useFileListController';

const ITEM_HEIGHT = 32;
const OVERSCAN = 5;

export interface VirtualFileListState {
  handleScroll: (event: React.UIEvent<HTMLDivElement>) => void;
  listRef: React.RefObject<HTMLDivElement | null>;
  topOffset: number;
  totalHeight: number;
  visibleItems: VisibleFileMatchItem[];
}

function getVisibleRange(
  itemCount: number,
  scrollTop: number,
  containerHeight: number,
): { visibleEnd: number; visibleStart: number } {
  const visibleStart = Math.max(0, Math.floor(scrollTop / ITEM_HEIGHT) - OVERSCAN);
  const visibleCount = Math.ceil(containerHeight / ITEM_HEIGHT) + OVERSCAN * 2;
  return {
    visibleEnd: Math.min(itemCount, visibleStart + visibleCount),
    visibleStart,
  };
}

function buildVisibleItems(
  filteredItems: FileMatchItem[],
  visibleStart: number,
  visibleEnd: number,
): VisibleFileMatchItem[] {
  return filteredItems.slice(visibleStart, visibleEnd).map((item, index) => ({
    ...item,
    absoluteIndex: visibleStart + index,
  }));
}

function syncFocusedItem(
  focusIndex: number,
  listRef: React.RefObject<HTMLDivElement | null>,
  scrollTop: number,
  containerHeight: number,
): void {
  const itemTop = focusIndex * ITEM_HEIGHT;
  const itemBottom = itemTop + ITEM_HEIGHT;
  const visibleBottom = scrollTop + containerHeight;

  if (itemTop < scrollTop) {
    listRef.current?.scrollTo({ top: itemTop });
  } else if (itemBottom > visibleBottom) {
    listRef.current?.scrollTo({ top: itemBottom - containerHeight });
  }
}

export function useResetFileListQuery(
  projectRoot: string | null,
  setQuery: React.Dispatch<React.SetStateAction<string>>,
  setFocusIndex: React.Dispatch<React.SetStateAction<number>>,
): void {
  useEffect(() => {
    if (!projectRoot) {
      return;
    }

    setQuery('');
    setFocusIndex(0);
  }, [projectRoot, setFocusIndex, setQuery]);
}

export function useVirtualFileList(
  filteredItems: FileMatchItem[],
  focusIndex: number,
): VirtualFileListState {
  const listRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const containerHeight = useRef(400);
  const { visibleEnd, visibleStart } = useMemo(
    () => getVisibleRange(filteredItems.length, scrollTop, containerHeight.current),
    [filteredItems.length, scrollTop],
  );
  const visibleItems = useMemo(
    () => buildVisibleItems(filteredItems, visibleStart, visibleEnd),
    [filteredItems, visibleEnd, visibleStart],
  );

  useEffect(() => {
    syncFocusedItem(focusIndex, listRef, scrollTop, containerHeight.current);
  }, [focusIndex, scrollTop]);

  const handleScroll = useCallback((event: React.UIEvent<HTMLDivElement>) => {
    containerHeight.current = event.currentTarget.clientHeight;
    setScrollTop(event.currentTarget.scrollTop);
  }, []);

  return {
    handleScroll,
    listRef,
    topOffset: visibleStart * ITEM_HEIGHT,
    totalHeight: filteredItems.length * ITEM_HEIGHT,
    visibleItems,
  };
}
