import React from 'react';

import { SymbolSearchPanel } from './SymbolSearchPanel';
import type { SymbolSearchProps } from './useSymbolSearchModel';
import { useSymbolSearchModel } from './useSymbolSearchModel';

export type { SymbolSearchProps } from './useSymbolSearchModel';

export function SymbolSearchContent(props: SymbolSearchProps): React.ReactElement | null {
  const model = useSymbolSearchModel(props);

  if (!props.isOpen) {
    return null;
  }

  return <SymbolSearchPanel {...model} isOpen={props.isOpen} onClose={props.onClose} />;
}
