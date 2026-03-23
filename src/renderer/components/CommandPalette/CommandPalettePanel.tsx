import React from 'react';

import { BreadcrumbBar } from './BreadcrumbBar';
import { CommandPaletteResults } from './CommandPaletteResults';
import { CommandPaletteSearchInput } from './CommandPaletteSearchInput';
import { PaletteFooter } from './PaletteOverlay';
import type { CommandPaletteModel } from './useCommandPaletteModel';

interface CommandPalettePanelProps {
  isOpen: boolean;
  model: CommandPaletteModel;
}

export function CommandPalettePanel({
  isOpen,
  model,
}: CommandPalettePanelProps): React.ReactElement {
  return (
    <>
      {model.navStack.length > 0 && (
        <BreadcrumbBar stack={model.navStack} onBack={model.navigateBack} />
      )}
      <CommandPaletteSearchInput
        inputRef={model.inputRef}
        isOpen={isOpen}
        onKeyDown={model.handleKeyDown}
        onQueryChange={model.handleQueryChange}
        placeholder={model.placeholder}
        query={model.query}
        selectedId={model.selectedId}
      />
      <CommandPaletteResults
        emptyLabel={model.emptyLabel}
        grouped={model.grouped}
        listRef={model.listRef}
        matches={model.matches}
        onExecute={model.handleExecute}
        onMouseEnter={model.handleMouseEnter}
        selectedIndex={model.selectedIndex}
        showHeaders={model.showHeaders}
      />
      <PaletteFooter hints={model.footerHints} />
    </>
  );
}
