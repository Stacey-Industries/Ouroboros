import React from 'react';

interface CancelBtnProps {
  onCancel: () => void;
  cancelling?: boolean;
}

export function CancelButton({ onCancel, cancelling }: CancelBtnProps): React.ReactElement {
  return (
    <button
      className="text-[10px] px-1.5 py-0.5 rounded transition-colors text-status-error"
      onClick={onCancel}
      aria-label="Cancel subagent"
      disabled={cancelling}
      style={{
        background: 'var(--status-error-subtle)',
        border: '1px solid var(--status-error)',
        cursor: cancelling ? 'not-allowed' : 'pointer',
        opacity: cancelling ? 0.6 : 1,
      }}
    >
      {cancelling ? 'Cancelling…' : 'Cancel'}
    </button>
  );
}
