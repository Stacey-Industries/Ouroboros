import React, { memo } from 'react';

export interface DirtyBannerProps {
  onReload?: () => void;
}

const bannerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  padding: '6px 12px',
  backgroundColor: 'rgba(210, 153, 34, 0.12)',
  borderBottom: '1px solid rgba(210, 153, 34, 0.3)',
  fontSize: '0.8125rem',
  flexShrink: 0,
};

const reloadButtonStyle: React.CSSProperties = {
  background: 'none',
  border: '1px solid var(--status-warning)',
  borderRadius: '4px',
  cursor: 'pointer',
  fontSize: '0.75rem',
  padding: '1px 8px',
};

/**
 * Banner shown when the file has been modified on disk.
 */
export const DirtyBanner = memo(function DirtyBanner({
  onReload,
}: DirtyBannerProps): React.ReactElement<any> {
  return (
    <div className="text-status-warning" style={bannerStyle}>
      <span>File has been modified on disk.</span>
      {onReload && (
        <button onClick={onReload} className="text-status-warning" style={reloadButtonStyle}>
          Reload
        </button>
      )}
    </div>
  );
});
