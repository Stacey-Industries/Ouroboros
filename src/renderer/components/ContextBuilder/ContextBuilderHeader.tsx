import React from 'react';

const headerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '12px 20px',
  borderBottom: '1px solid var(--border-default)',
  flexShrink: 0,
};

const titleRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
};

const titleStyle: React.CSSProperties = {
  fontSize: '14px',
  fontWeight: 600,
};

const scanningStyle: React.CSSProperties = {
  fontSize: '12px',
  fontStyle: 'italic',
};

const statusStyle: React.CSSProperties = {
  fontSize: '11px',
  padding: '2px 8px',
  borderRadius: '4px',
  background: 'rgba(88, 166, 255, 0.1)',
};

const closeButtonStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  padding: '4px',
  fontSize: '16px',
  lineHeight: 1,
};

interface ContextBuilderHeaderProps {
  onClose: () => void;
  scanning: boolean;
  statusMessage: string | null;
}

export function ContextBuilderHeader({
  onClose,
  scanning,
  statusMessage,
}: ContextBuilderHeaderProps): React.ReactElement {
  return (
    <div style={headerStyle}>
      <HeaderTitle scanning={scanning} statusMessage={statusMessage} />
      <button
        onClick={onClose}
        aria-label="Close context builder"
        className="text-text-semantic-muted"
        style={closeButtonStyle}
      >
        x
      </button>
    </div>
  );
}

function HeaderTitle({
  scanning,
  statusMessage,
}: Pick<ContextBuilderHeaderProps, 'scanning' | 'statusMessage'>): React.ReactElement {
  return (
    <div style={titleRowStyle}>
      <ContextBuilderIcon />
      <span className="text-text-semantic-primary" style={titleStyle}>
        Context Builder
      </span>
      <HeaderStatus scanning={scanning} statusMessage={statusMessage} />
    </div>
  );
}

function HeaderStatus({
  scanning,
  statusMessage,
}: Pick<ContextBuilderHeaderProps, 'scanning' | 'statusMessage'>): React.ReactElement | null {
  if (!scanning && !statusMessage) {
    return null;
  }

  return (
    <>
      {scanning && (
        <span className="text-text-semantic-muted" style={scanningStyle}>
          Scanning...
        </span>
      )}
      {statusMessage && (
        <span className="text-interactive-accent" style={statusStyle}>
          {statusMessage}
        </span>
      )}
    </>
  );
}

function ContextBuilderIcon(): React.ReactElement {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path
        d="M8 1L14 4.5V11.5L8 15L2 11.5V4.5L8 1Z"
        stroke="var(--interactive-accent)"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <circle cx="8" cy="8" r="2" fill="var(--interactive-accent)" />
    </svg>
  );
}
