import React from 'react';

import { CommandPalettePanel } from './CommandPalettePanel';
import { PaletteOverlay } from './PaletteOverlay';
import type { Command } from './types';
import { useCommandPaletteModel } from './useCommandPaletteModel';

const PALETTE_KEYFRAMES = `
  @keyframes cp-overlay-in { from { opacity: 0; } to { opacity: 1; } }
  @keyframes cp-card-in { from { opacity: 0; transform: scale(0.97) translateY(-4px); } to { opacity: 1; transform: scale(1) translateY(0); } }
`;

export interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  commands: Command[];
  recentIds: string[];
  onExecute: (command: Command) => Promise<void>;
}

export function CommandPalette(props: CommandPaletteProps): React.ReactElement | null {
  const model = useCommandPaletteModel(props);

  return (
    <>
      <style>{PALETTE_KEYFRAMES}</style>
      <PaletteOverlay isVisible={props.isOpen} onClose={props.onClose}>
        <CommandPalettePanel isOpen={props.isOpen} model={model} />
      </PaletteOverlay>
    </>
  );
}
