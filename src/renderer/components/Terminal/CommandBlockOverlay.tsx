import React from 'react';

import type { CommandBlockOverlayProps } from './CommandBlockOverlayBody';
import { CommandBlockOverlayBody } from './CommandBlockOverlayBody';

export type { CommandBlockOverlayProps } from './CommandBlockOverlayBody';

export function CommandBlockOverlay(props: CommandBlockOverlayProps): React.ReactElement<any> | null {
  return <CommandBlockOverlayBody {...props} />;
}
