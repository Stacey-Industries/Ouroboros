import React from 'react';

function WorkbenchRailIcon(): React.ReactElement {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
    >
      <rect x="1.5" y="2.5" width="13" height="11" rx="1.5" />
      <line x1="5.5" y1="2.5" x2="5.5" y2="13.5" />
    </svg>
  );
}

export function WorkbenchRailToggleButton({
  railOpen,
  onToggle,
}: {
  railOpen: boolean;
  onToggle: () => void;
}): React.ReactElement {
  return (
    <button
      type="button"
      className={`flex items-center justify-center w-8 h-8 rounded transition-colors shrink-0 ${
        railOpen
          ? 'text-interactive-accent bg-interactive-accent-subtle hover:bg-interactive-accent-subtle'
          : 'text-text-semantic-muted hover:text-text-semantic-primary hover:bg-surface-hover'
      }`}
      style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      onClick={onToggle}
      title={railOpen ? 'Hide workbench rail' : 'Show workbench rail'}
      aria-label={railOpen ? 'Hide workbench rail' : 'Show workbench rail'}
      aria-pressed={railOpen}
      data-testid="workbench-rail-toggle"
    >
      <WorkbenchRailIcon />
    </button>
  );
}
