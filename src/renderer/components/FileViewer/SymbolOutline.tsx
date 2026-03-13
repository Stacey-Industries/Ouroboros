import React, { useEffect, useState, useCallback, memo } from 'react';
import type { OutlineSymbol, SymbolKind } from '../../hooks/useSymbolOutline';

export interface SymbolOutlineProps {
  symbols: OutlineSymbol[];
  /** The scrollable container for the main code area */
  scrollContainer: HTMLDivElement | null;
  /** The container that holds the rendered code lines (for scrolling to a line) */
  codeContainer: HTMLDivElement | null;
  /** Whether the panel is visible */
  visible: boolean;
}

// ── Icon characters per symbol kind ──────────────────────────────────────────

const KIND_ICON: Record<SymbolKind, string> = {
  function: 'ƒ',
  class: 'C',
  interface: 'I',
  type: 'T',
  method: 'm',
  variable: 'v',
  heading: 'H',
};

const KIND_COLOR: Record<SymbolKind, string> = {
  function: '#daa520',  // gold
  class: '#4ec9b0',     // teal
  interface: '#9cdcfe', // light blue
  type: '#c586c0',      // purple
  method: '#b5cea8',    // green-grey
  variable: '#9cdcfe',  // light blue
  heading: '#569cd6',   // blue
};

// ── Flash highlight ───────────────────────────────────────────────────────────

let flashStyleInjected = false;

function ensureFlashStyle() {
  if (flashStyleInjected || typeof document === 'undefined') return;
  flashStyleInjected = true;
  const style = document.createElement('style');
  style.id = '__symbol-outline-flash__';
  style.textContent = `
    @keyframes outline-flash {
      0%   { background-color: rgba(255, 200, 0, 0.35); }
      60%  { background-color: rgba(255, 200, 0, 0.35); }
      100% { background-color: transparent; }
    }
    .outline-line-flash {
      animation: outline-flash 900ms ease-out forwards;
    }
  `;
  document.head.appendChild(style);
}

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * SymbolOutline — a collapsible side panel listing structural symbols in the
 * open file. Clicking a symbol scrolls the file viewer to that line and
 * briefly flashes it. The active symbol tracks the symbol whose line is
 * nearest to the top of the current viewport.
 */
export const SymbolOutline = memo(function SymbolOutline({
  symbols,
  scrollContainer,
  codeContainer,
  visible,
}: SymbolOutlineProps): React.ReactElement | null {
  const [activeIndex, setActiveIndex] = useState<number>(-1);

  // Inject flash keyframe once
  useEffect(() => {
    ensureFlashStyle();
  }, []);

  // Track scroll position to derive active symbol
  useEffect(() => {
    if (!scrollContainer || !visible || symbols.length === 0) return;

    const updateActive = () => {
      const { scrollTop, clientHeight } = scrollContainer;
      // Approximate: line height is 0.8125rem * 1.6 ≈ 20.8px
      // Use lineHeight from codeContainer if possible, fall back to 20.8
      let lineH = 20.8;
      if (codeContainer) {
        const firstLine = codeContainer.querySelector('.code-line') as HTMLElement | null;
        if (firstLine) {
          lineH = firstLine.offsetHeight || lineH;
        }
      }

      // The viewport top corresponds to this approximate 0-based line
      const topLine = Math.floor((scrollTop - 16) / lineH); // 16px padding
      const midLine = topLine + Math.floor(clientHeight / lineH / 4);

      // Find last symbol whose line is <= midLine
      let best = -1;
      for (let i = 0; i < symbols.length; i++) {
        if (symbols[i].line <= midLine) {
          best = i;
        } else {
          break;
        }
      }
      setActiveIndex(best);
    };

    updateActive();
    scrollContainer.addEventListener('scroll', updateActive, { passive: true });
    return () => scrollContainer.removeEventListener('scroll', updateActive);
  }, [scrollContainer, codeContainer, visible, symbols]);

  // Navigate to a symbol's line in the code area
  const handleSymbolClick = useCallback(
    (symbol: OutlineSymbol) => {
      if (!scrollContainer || !codeContainer) return;

      // Locate the DOM node for that line
      const lineEl = codeContainer.querySelector(
        `[data-line="${symbol.line}"]`
      ) as HTMLElement | null;

      if (lineEl) {
        // Scroll line into view (near top)
        const containerRect = scrollContainer.getBoundingClientRect();
        const lineRect = lineEl.getBoundingClientRect();
        const offset = lineRect.top - containerRect.top + scrollContainer.scrollTop - 32;
        scrollContainer.scrollTo({ top: Math.max(0, offset), behavior: 'smooth' });

        // Flash highlight
        lineEl.classList.remove('outline-line-flash');
        // Force reflow to restart animation
        void lineEl.offsetWidth;
        lineEl.classList.add('outline-line-flash');
        setTimeout(() => lineEl.classList.remove('outline-line-flash'), 950);
      } else {
        // Fallback: approximate scroll by line number
        let lineH = 20.8;
        const firstLine = codeContainer.querySelector('.code-line') as HTMLElement | null;
        if (firstLine) lineH = firstLine.offsetHeight || lineH;
        scrollContainer.scrollTo({
          top: Math.max(0, symbol.line * lineH + 16 - 32),
          behavior: 'smooth',
        });
      }
    },
    [scrollContainer, codeContainer]
  );

  if (!visible) return null;
  if (symbols.length === 0) {
    return (
      <div
        style={{
          width: '180px',
          flexShrink: 0,
          borderLeft: '1px solid var(--border-muted)',
          backgroundColor: 'var(--bg)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--text-faint)',
          fontSize: '0.6875rem',
          fontFamily: 'var(--font-ui)',
          padding: '16px 8px',
          textAlign: 'center',
        }}
      >
        No symbols found
      </div>
    );
  }

  return (
    <div
      style={{
        width: '180px',
        flexShrink: 0,
        borderLeft: '1px solid var(--border-muted)',
        backgroundColor: 'var(--bg)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        style={{
          flexShrink: 0,
          padding: '4px 8px',
          borderBottom: '1px solid var(--border-muted)',
          fontSize: '0.6875rem',
          fontFamily: 'var(--font-ui)',
          color: 'var(--text-faint)',
          letterSpacing: '0.05em',
          textTransform: 'uppercase',
          userSelect: 'none',
        }}
      >
        Outline
      </div>

      {/* Symbol list */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          overflowX: 'hidden',
        }}
      >
        {symbols.map((sym, idx) => {
          const isActive = idx === activeIndex;
          const icon = KIND_ICON[sym.kind];
          const color = KIND_COLOR[sym.kind];
          const indentPx = 8 + sym.depth * 12;

          return (
            <button
              key={`${sym.line}-${sym.name}-${idx}`}
              onClick={() => handleSymbolClick(sym)}
              title={`${sym.name} (line ${sym.line + 1})`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                width: '100%',
                paddingLeft: `${indentPx}px`,
                paddingRight: '8px',
                paddingTop: '2px',
                paddingBottom: '2px',
                background: isActive ? 'var(--bg-secondary)' : 'none',
                border: 'none',
                borderLeft: isActive ? '2px solid var(--accent)' : '2px solid transparent',
                cursor: 'pointer',
                textAlign: 'left',
                fontFamily: 'var(--font-mono)',
                fontSize: '0.6875rem',
                lineHeight: '1.5',
                color: isActive ? 'var(--text)' : 'var(--text-muted)',
                overflow: 'hidden',
                whiteSpace: 'nowrap',
                textOverflow: 'ellipsis',
                flexShrink: 0,
                minWidth: 0,
              }}
              onMouseEnter={(e) => {
                if (!isActive) {
                  (e.currentTarget as HTMLButtonElement).style.backgroundColor =
                    'var(--bg-secondary)';
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent';
                }
              }}
            >
              {/* Kind icon */}
              <span
                style={{
                  flexShrink: 0,
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.6875rem',
                  color,
                  width: '10px',
                  textAlign: 'center',
                  userSelect: 'none',
                }}
              >
                {icon}
              </span>

              {/* Symbol name */}
              <span
                style={{
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  flex: 1,
                  minWidth: 0,
                }}
              >
                {sym.name}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
});
