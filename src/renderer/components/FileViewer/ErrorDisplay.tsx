import React, { memo } from 'react';

export interface ErrorDisplayProps {
  error: string;
}

const containerStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  height: '100%',
  gap: '8px',
  fontSize: '0.875rem',
  padding: '24px',
  textAlign: 'center',
};

/**
 * Error state display for the file viewer.
 */
export const ErrorDisplay = memo(function ErrorDisplay({
  error,
}: ErrorDisplayProps): React.ReactElement<any> {
  return (
    <div className="text-status-error" style={containerStyle}>
      <span style={{ fontSize: '1.5rem' }}>{'\u26A0'}</span>
      <span>{error}</span>
    </div>
  );
});
