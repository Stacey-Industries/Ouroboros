/**
 * ChatStatusChipRow — thin chip strip below the composer in chat-only mode.
 *
 * Wave 44 Phase D. Moves model + permission chips out of the title bar
 * (where the drag region + popover portal interactions are brittle) into
 * a Piebald-style ghost chip row directly beneath the composer pill.
 *
 * Reuses ChatOnlyHeaderControls for the actual chip rendering — this
 * component only provides the strip wrapper and layout alignment with
 * the composer edge (px-4 matches AgentChatComposer's outer padding).
 */

import React from 'react';

import { ChatOnlyHeaderControls } from './ChatOnlyHeaderControls';

export function ChatStatusChipRow(): React.ReactElement {
  return (
    <div
      data-testid="chat-status-chip-row"
      className="px-4 pt-1 pb-0.5 flex items-center gap-1.5 text-xs text-text-semantic-muted shrink-0"
    >
      <ChatOnlyHeaderControls />
    </div>
  );
}
