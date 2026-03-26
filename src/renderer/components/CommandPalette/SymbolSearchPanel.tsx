import React from 'react';

import { PaletteAnimations } from './paletteAnimations';
import { PaletteFooter } from './PaletteOverlay';
import { PickerInput, PickerOverlay } from './PickerOverlay';
import { SymbolItem } from './SymbolItem';
import type { SymbolSearchModel, SymbolSearchProps } from './useSymbolSearchModel';

const ITEM_HEIGHT = 40;
const MAX_VISIBLE = 12;
const BASE_FOOTER_HINTS = [
  '\u2191\u2193 navigate',
  '\u21b5 open',
  'esc close',
];

const listStyle: React.CSSProperties = {
  maxHeight: `${ITEM_HEIGHT * MAX_VISIBLE}px`,
  overflowY: 'auto',
  padding: '4px 0',
};

const emptyStateStyle: React.CSSProperties = {
  padding: '16px 14px',
  fontSize: '13px',
  textAlign: 'center',
};

type SymbolSearchPanelProps = SymbolSearchModel & Pick<SymbolSearchProps, 'isOpen' | 'onClose'>;

export function SymbolSearchPanel(props: SymbolSearchPanelProps): React.ReactElement {
  return (
    <>
      <PaletteAnimations prefix="ss" />
      <PickerOverlay
        label="Symbol Search"
        animPrefix="ss"
        maxWidth="620px"
        onClose={props.onClose}
      >
        <PickerInput
          inputRef={props.inputRef}
          prefix="@"
          placeholder="Go to symbol..."
          value={props.query}
          isOpen={props.isOpen}
          controlsId="ss-listbox"
          onChange={props.handleQueryChange}
          onKeyDown={props.handleKeyDown}
          statusText={props.isLoading ? 'scanning...' : undefined}
        />
        <SymbolResultsList
          emptyLabel={props.emptyLabel}
          listRef={props.listRef}
          matches={props.matches}
          onHover={props.setSelectedIndex}
          onSelect={props.handleSelect}
          selectedIndex={props.selectedIndex}
        />
        <PaletteFooter hints={getFooterHints(props.allSymbols.length)} />
      </PickerOverlay>
    </>
  );
}

function SymbolResultsList({
  emptyLabel,
  listRef,
  matches,
  onHover,
  onSelect,
  selectedIndex,
}: {
  emptyLabel: string;
  listRef: React.RefObject<HTMLDivElement | null>;
  matches: SymbolSearchModel['matches'];
  onHover: (index: number) => void;
  onSelect: SymbolSearchModel['handleSelect'];
  selectedIndex: number;
}): React.ReactElement {
  if (matches.length === 0) {
    return (
      <div id="ss-listbox" role="listbox" aria-label="Symbols" ref={listRef as React.RefObject<HTMLDivElement>} style={listStyle}>
        <div className="text-text-semantic-muted" style={emptyStateStyle}>{emptyLabel}</div>
      </div>
    );
  }

  return (
    <div id="ss-listbox" role="listbox" aria-label="Symbols" ref={listRef as React.RefObject<HTMLDivElement>} style={listStyle}>
      {matches.map((match, index) => (
        <SymbolItem
          key={`${match.entry.filePath}:${match.entry.line}:${match.entry.name}`}
          entry={match.entry}
          isSelected={index === selectedIndex}
          nameIndices={match.nameIndices}
          onClick={() => onSelect(match.entry)}
          onMouseEnter={() => onHover(index)}
          pathIndices={match.pathIndices}
        />
      ))}
    </div>
  );
}

function getFooterHints(symbolCount: number): string[] {
  if (symbolCount === 0) {
    return BASE_FOOTER_HINTS;
  }

  return [...BASE_FOOTER_HINTS, `${symbolCount} symbols`];
}
