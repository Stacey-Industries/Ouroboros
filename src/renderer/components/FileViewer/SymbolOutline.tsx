import React, { useCallback, useEffect, useState, memo } from 'react';
import type { OutlineSymbol } from '../../hooks/useSymbolOutline';
import {
  CODE_PADDING_TOP,
  DEFAULT_LINE_HEIGHT,
  FLASH_CLASS_NAME,
  FLASH_DURATION_MS,
  FLASH_STYLE_ID,
  FLASH_STYLE_TEXT,
  KIND_COLOR,
  KIND_ICON,
  OUTLINE_EMPTY_STATE_STYLE,
  OUTLINE_HEADER_STYLE,
  OUTLINE_LIST_STYLE,
  OUTLINE_NAME_STYLE,
  OUTLINE_PANEL_STYLE,
  SCROLL_OFFSET,
  getOutlineIconStyle,
  getOutlineItemStyle,
} from './SymbolOutline.shared';

export interface SymbolOutlineProps {
  symbols: OutlineSymbol[];
  scrollContainer: HTMLDivElement | null;
  codeContainer: HTMLDivElement | null;
  visible: boolean;
}

let flashStyleInjected = false;

function ensureFlashStyle(): void {
  if (typeof document === 'undefined') return;
  if (flashStyleInjected || document.getElementById(FLASH_STYLE_ID)) {
    flashStyleInjected = true;
    return;
  }
  flashStyleInjected = true;
  const style = document.createElement('style');
  style.id = FLASH_STYLE_ID;
  style.textContent = FLASH_STYLE_TEXT;
  document.head.appendChild(style);
}

function useOutlineFlashStyle(): void {
  useEffect(() => {
    ensureFlashStyle();
  }, []);
}

function getCodeLineHeight(codeContainer: HTMLDivElement | null): number {
  const firstLine = codeContainer?.querySelector('.code-line') as HTMLElement | null;
  return firstLine?.offsetHeight || DEFAULT_LINE_HEIGHT;
}

function getActiveSymbolIndex(
  scrollContainer: HTMLDivElement,
  codeContainer: HTMLDivElement | null,
  symbols: OutlineSymbol[]
): number {
  const lineHeight = getCodeLineHeight(codeContainer);
  const topLine = Math.floor((scrollContainer.scrollTop - CODE_PADDING_TOP) / lineHeight);
  const midLine = topLine + Math.floor(scrollContainer.clientHeight / lineHeight / 4);
  let activeIndex = -1;
  for (const [index, symbol] of symbols.entries()) {
    if (symbol.line > midLine) break;
    activeIndex = index;
  }
  return activeIndex;
}

function useActiveSymbolIndex(
  scrollContainer: HTMLDivElement | null,
  codeContainer: HTMLDivElement | null,
  visible: boolean,
  symbols: OutlineSymbol[]
): number {
  const [activeIndex, setActiveIndex] = useState(-1);
  useEffect(() => {
    if (!scrollContainer || !visible || symbols.length === 0) return;
    const updateActiveIndex = () =>
      setActiveIndex(getActiveSymbolIndex(scrollContainer, codeContainer, symbols));
    updateActiveIndex();
    scrollContainer.addEventListener('scroll', updateActiveIndex, { passive: true });
    return () => scrollContainer.removeEventListener('scroll', updateActiveIndex);
  }, [codeContainer, scrollContainer, symbols, visible]);
  return activeIndex;
}

function scrollLineIntoView(
  scrollContainer: HTMLDivElement,
  lineElement: HTMLElement
): void {
  const containerRect = scrollContainer.getBoundingClientRect();
  const lineRect = lineElement.getBoundingClientRect();
  const top =
    lineRect.top - containerRect.top + scrollContainer.scrollTop - SCROLL_OFFSET;
  scrollContainer.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
}

function flashLine(lineElement: HTMLElement): void {
  lineElement.classList.remove(FLASH_CLASS_NAME);
  void lineElement.offsetWidth;
  lineElement.classList.add(FLASH_CLASS_NAME);
  window.setTimeout(() => lineElement.classList.remove(FLASH_CLASS_NAME), FLASH_DURATION_MS);
}

function scrollToApproximateLine(
  scrollContainer: HTMLDivElement,
  codeContainer: HTMLDivElement,
  line: number
): void {
  const lineHeight = getCodeLineHeight(codeContainer);
  scrollContainer.scrollTo({
    top: Math.max(0, line * lineHeight + CODE_PADDING_TOP - SCROLL_OFFSET),
    behavior: 'smooth',
  });
}

function navigateToSymbolLine(
  symbol: OutlineSymbol,
  scrollContainer: HTMLDivElement | null,
  codeContainer: HTMLDivElement | null
): void {
  if (!scrollContainer || !codeContainer) return;
  const lineElement = codeContainer.querySelector(
    `[data-line="${symbol.line}"]`
  ) as HTMLElement | null;
  if (!lineElement) {
    scrollToApproximateLine(scrollContainer, codeContainer, symbol.line);
    return;
  }
  scrollLineIntoView(scrollContainer, lineElement);
  flashLine(lineElement);
}

function OutlineHeader(): React.ReactElement {
  return <div style={OUTLINE_HEADER_STYLE}>Outline</div>;
}

function OutlineEmptyState(): React.ReactElement {
  return <div style={OUTLINE_EMPTY_STATE_STYLE}>No symbols found</div>;
}

function handleOutlineItemMouseEnter(
  event: React.MouseEvent<HTMLButtonElement>
): void {
  event.currentTarget.style.backgroundColor = 'var(--bg-secondary)';
}

function handleOutlineItemMouseLeave(
  event: React.MouseEvent<HTMLButtonElement>
): void {
  event.currentTarget.style.backgroundColor = 'transparent';
}

interface OutlineItemProps {
  isActive: boolean;
  onClick: (symbol: OutlineSymbol) => void;
  symbol: OutlineSymbol;
}

function OutlineItem({
  isActive,
  onClick,
  symbol,
}: OutlineItemProps): React.ReactElement {
  return (
    <button
      onClick={() => onClick(symbol)}
      title={`${symbol.name} (line ${symbol.line + 1})`}
      style={getOutlineItemStyle(symbol.depth, isActive)}
      onMouseEnter={isActive ? undefined : handleOutlineItemMouseEnter}
      onMouseLeave={isActive ? undefined : handleOutlineItemMouseLeave}
    >
      <span style={getOutlineIconStyle(KIND_COLOR[symbol.kind])}>
        {KIND_ICON[symbol.kind]}
      </span>
      <span style={OUTLINE_NAME_STYLE}>{symbol.name}</span>
    </button>
  );
}

interface OutlineListProps {
  activeIndex: number;
  onSymbolClick: (symbol: OutlineSymbol) => void;
  symbols: OutlineSymbol[];
}

function OutlineList({
  activeIndex,
  onSymbolClick,
  symbols,
}: OutlineListProps): React.ReactElement {
  return (
    <div style={OUTLINE_LIST_STYLE}>
      {symbols.map((symbol, index) => (
        <OutlineItem
          key={`${symbol.line}-${symbol.name}-${index}`}
          isActive={index === activeIndex}
          onClick={onSymbolClick}
          symbol={symbol}
        />
      ))}
    </div>
  );
}

export const SymbolOutline = memo(function SymbolOutline({
  symbols,
  scrollContainer,
  codeContainer,
  visible,
}: SymbolOutlineProps): React.ReactElement | null {
  useOutlineFlashStyle();
  const activeIndex = useActiveSymbolIndex(
    scrollContainer,
    codeContainer,
    visible,
    symbols
  );
  const handleSymbolClick = useCallback(
    (symbol: OutlineSymbol) => navigateToSymbolLine(symbol, scrollContainer, codeContainer),
    [codeContainer, scrollContainer]
  );
  if (!visible) return null;
  if (symbols.length === 0) return <OutlineEmptyState />;
  return (
    <div style={OUTLINE_PANEL_STYLE}>
      <OutlineHeader />
      <OutlineList
        activeIndex={activeIndex}
        onSymbolClick={handleSymbolClick}
        symbols={symbols}
      />
    </div>
  );
});
