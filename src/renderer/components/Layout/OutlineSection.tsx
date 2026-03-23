/**
 * OutlineSection — Shows the symbol outline for the active file in the sidebar.
 *
 * Reuses useSymbolOutline for symbol extraction and the shared icon/color
 * constants from SymbolOutline.shared.
 */

import React, { useCallback } from 'react';

import type { OutlineSymbol } from '../../hooks/useSymbolOutline';
import { useSymbolOutline } from '../../hooks/useSymbolOutline';
import { useFileViewerManager } from '../FileViewer';
import { detectLanguage } from '../FileViewer/monacoSetup';
import {
  getOutlineIconStyle,
  KIND_COLOR,
  KIND_ICON,
  OUTLINE_NAME_STYLE,
} from '../FileViewer/SymbolOutline.shared';

function OutlineEmptyState({ message }: { message: string }): React.ReactElement {
  return (
    <div
      className="flex items-center justify-center text-text-semantic-muted"
      style={{
        fontSize: '0.6875rem',
        fontFamily: 'var(--font-ui)',
        padding: '16px 12px',
        textAlign: 'center',
        lineHeight: '1.6',
      }}
    >
      {message}
    </div>
  );
}

interface OutlineItemProps {
  symbol: OutlineSymbol;
  onClick: (symbol: OutlineSymbol) => void;
}

const OUTLINE_ITEM_BUTTON_BASE: React.CSSProperties = {
  background: 'none', fontFamily: 'var(--font-mono)', fontSize: '0.6875rem',
  lineHeight: '1.5', textAlign: 'left', overflow: 'hidden',
  whiteSpace: 'nowrap', textOverflow: 'ellipsis', minWidth: 0,
  paddingRight: '8px', paddingTop: '2px', paddingBottom: '2px',
};

const OUTLINE_LINE_NUM_STYLE: React.CSSProperties = {
  flexShrink: 0, fontSize: '0.6rem', fontFamily: 'var(--font-mono)',
  marginLeft: 'auto', paddingLeft: '4px',
};

function OutlineItem({ symbol, onClick }: OutlineItemProps): React.ReactElement {
  const handlePointerEnter = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    e.currentTarget.style.backgroundColor = 'var(--surface-raised)';
  }, []);
  const handlePointerLeave = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    e.currentTarget.style.backgroundColor = 'transparent';
  }, []);
  return (
    <button
      className="flex items-center gap-1.5 w-full border-none cursor-pointer outline-none text-text-semantic-secondary"
      style={{ ...OUTLINE_ITEM_BUTTON_BASE, paddingLeft: `${8 + symbol.depth * 12}px` }}
      onClick={() => onClick(symbol)}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
      title={`${symbol.name} (line ${symbol.line + 1})`}
    >
      <span style={getOutlineIconStyle(KIND_COLOR[symbol.kind])}>{KIND_ICON[symbol.kind]}</span>
      <span style={OUTLINE_NAME_STYLE}>{symbol.name}</span>
      <span className="text-text-semantic-faint" style={OUTLINE_LINE_NUM_STYLE}>{symbol.line + 1}</span>
    </button>
  );
}

/**
 * Navigate to a line in the editor by dispatching a DOM event.
 * The file viewer listens for this to scroll to the target line.
 */
function navigateToLine(line: number, filePath: string): void {
  window.dispatchEvent(
    new CustomEvent('agent-ide:goto-line', {
      detail: { line: line + 1, filePath },
    }),
  );
}

export function OutlineSection(): React.ReactElement {
  const { activeFile } = useFileViewerManager();
  const language = activeFile?.path ? detectLanguage(activeFile.path) : 'plaintext';
  const symbols = useSymbolOutline(activeFile?.content ?? null, language);

  const handleSymbolClick = useCallback(
    (symbol: OutlineSymbol) => {
      if (activeFile?.path) {
        navigateToLine(symbol.line, activeFile.path);
      }
    },
    [activeFile?.path],
  );

  if (!activeFile) {
    return <OutlineEmptyState message="Open a file to see its outline" />;
  }

  if (symbols.length === 0) {
    return <OutlineEmptyState message="No symbols found" />;
  }

  return (
    <div className="flex flex-col">
      {symbols.map((symbol, index) => (
        <OutlineItem
          key={`${symbol.line}-${symbol.name}-${index}`}
          symbol={symbol}
          onClick={handleSymbolClick}
        />
      ))}
    </div>
  );
}

/** Returns the symbol count for the active file (for the section badge). */
export function useOutlineSymbolCount(): number {
  const { activeFile } = useFileViewerManager();
  const language = activeFile?.path ? detectLanguage(activeFile.path) : 'plaintext';
  const symbols = useSymbolOutline(activeFile?.content ?? null, language);
  return symbols.length;
}
