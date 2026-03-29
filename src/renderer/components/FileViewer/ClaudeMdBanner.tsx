import React, { memo } from 'react';

const bannerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  padding: '4px 12px',
  backgroundColor: 'rgba(88, 166, 255, 0.08)',
  borderBottom: '1px solid var(--border-default)',
  fontFamily: 'var(--font-ui)',
  fontSize: '0.6875rem',
};

/**
 * Informational banner shown when viewing a CLAUDE.md file (not in edit mode).
 */
export const ClaudeMdBanner = memo(function ClaudeMdBanner(): React.ReactElement<any> {
  return (
    <div className="text-text-semantic-muted" style={bannerStyle}>
      <span className="text-interactive-accent" style={{ fontWeight: 600 }}>
        CLAUDE.md
      </span>
      <span>
        Enhanced editor available — click Edit to use section navigation, token counting, and
        templates
      </span>
    </div>
  );
});
