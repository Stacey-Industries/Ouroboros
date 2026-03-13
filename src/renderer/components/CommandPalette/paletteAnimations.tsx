import React from 'react';

/** Inject keyframe animations for the command palette family of overlays. */
export function PaletteAnimations({ prefix }: { prefix: string }): React.ReactElement {
  return (
    <style>{`
      @keyframes ${prefix}-overlay-in {
        from { opacity: 0; }
        to   { opacity: 1; }
      }
      @keyframes ${prefix}-card-in {
        from { opacity: 0; transform: scale(0.97) translateY(-4px); }
        to   { opacity: 1; transform: scale(1) translateY(0); }
      }
    `}</style>
  );
}
