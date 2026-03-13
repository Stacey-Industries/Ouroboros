/**
 * LoadingScreen — displayed while the app config is loading on startup.
 */

import React from 'react';

export function LoadingScreen(): React.ReactElement {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '100vw',
        height: '100vh',
        backgroundColor: 'var(--bg, #0d1117)',
        color: 'var(--text-muted, #8b949e)',
        flexDirection: 'column',
        gap: '12px',
      }}
    >
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        style={{ animation: 'spin 1s linear infinite' }}
      >
        <circle cx="12" cy="12" r="10" stroke="var(--border, #30363d)" strokeWidth="2" />
        <path
          d="M12 2a10 10 0 0 1 10 10"
          stroke="var(--accent, #58a6ff)"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
      <span style={{ fontSize: '13px', fontFamily: 'var(--font-ui, system-ui)' }}>
        Loading…
      </span>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
