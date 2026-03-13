import React from 'react';
import { CommandBlockOverlayBody } from './CommandBlockOverlayBody';
import type { CommandBlockOverlayProps } from './CommandBlockOverlayBody';

export type { CommandBlockOverlayProps } from './CommandBlockOverlayBody';

export function CommandBlockOverlay(props: CommandBlockOverlayProps): React.ReactElement | null {
  return <CommandBlockOverlayBody {...props} />;
}
