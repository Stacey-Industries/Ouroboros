/**
 * NoDragZone.tsx — Wave 28 Phase E
 *
 * Prevents dnd-kit's PointerSensor and TouchSensor from initiating a drag
 * when the pointer or touch originates inside this zone. Used to wrap the
 * xterm canvas so terminal text selection does not race with pane dragging.
 *
 * Mechanism: stopPropagation on the capture phase of pointerdown and
 * touchstart. The PointerSensor and TouchSensor both listen on the document
 * (bubble phase), so capture-phase interception silences them without
 * breaking any xterm internal handlers.
 *
 * The drag HANDLE in the pane header sits above this zone and is therefore
 * unaffected — NoDragZone only wraps the interactive content area.
 */

import React, { useCallback } from 'react';

const containerStyle: React.CSSProperties = { height: '100%', width: '100%' };

function stopPropagation(e: React.SyntheticEvent): void {
  e.stopPropagation();
}

export function NoDragZone({ children }: { children: React.ReactNode }): React.ReactElement {
  const stop = useCallback(stopPropagation, []);

  return (
    <div
      style={containerStyle}
      onPointerDownCapture={stop}
      onTouchStartCapture={stop}
    >
      {children}
    </div>
  );
}
