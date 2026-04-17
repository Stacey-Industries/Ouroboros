/**
 * DiffReviewHeaderActions.tsx — Action buttons in the diff review header.
 *
 * Extracted from DiffReviewPanelSections.tsx to keep that file under 300 lines.
 * Includes Accept All / Reject All / Close / Undo Last Accept buttons.
 */

import React, { useState } from 'react';

export interface DiffReviewHeaderActionsProps {
  allDecided: boolean;
  canRollback: boolean;
  enhancedEnabled: boolean;
  onAcceptAll: () => void;
  onClose: () => void;
  onRejectAll: () => void;
  onRollback: () => void;
}

function HeaderBtn({
  color,
  disabled,
  label,
  onClick,
  title,
}: {
  color: string;
  disabled?: boolean;
  label: string;
  onClick: () => void;
  title?: string;
}): React.ReactElement {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title={title}
      style={{
        padding: '2px 10px',
        fontSize: '0.6875rem',
        fontFamily: 'var(--font-ui)',
        fontWeight: 500,
        border: `1px solid ${color}`,
        borderRadius: '4px',
        background: hovered && !disabled ? color : 'transparent',
        color: hovered && !disabled ? 'var(--text-on-accent)' : color,
        cursor: disabled ? 'default' : 'pointer',
        lineHeight: '1.5',
        transition: 'background 0.1s, color 0.1s',
        opacity: disabled ? 0.4 : 1,
      }}
    >
      {label}
    </button>
  );
}

export function DiffReviewHeaderActions({
  allDecided,
  canRollback,
  enhancedEnabled,
  onAcceptAll,
  onClose,
  onRejectAll,
  onRollback,
}: DiffReviewHeaderActionsProps): React.ReactElement {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
      {enhancedEnabled && (
        <HeaderBtn
          label="Undo last accept"
          color="var(--interactive-accent)"
          disabled={!canRollback}
          onClick={onRollback}
          title="Move the most recently accepted hunks back to pending"
        />
      )}
      {!allDecided && (
        <>
          <HeaderBtn label="Accept All" color="var(--status-success)" onClick={onAcceptAll} />
          <HeaderBtn label="Reject All" color="var(--status-error)" onClick={onRejectAll} />
        </>
      )}
      <HeaderBtn label={allDecided ? 'Done' : 'Close'} color="var(--interactive-accent)" onClick={onClose} />
    </div>
  );
}
