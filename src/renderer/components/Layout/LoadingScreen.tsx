/**
 * LoadingScreen — displayed while the app config is loading on startup.
 */

import React from 'react';

import ouroborosLogo from '../../../../public/OUROBOROS.png';

export function LoadingScreen(): React.ReactElement<any> {
  return (
    <div
      className="text-text-semantic-muted"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '100vw',
        height: '100vh',
        flexDirection: 'column',
        gap: '20px',
        background: 'transparent',
      }}
    >
      <img
        src={ouroborosLogo}
        alt="Ouroboros"
        draggable={false}
        style={{
          width: '64px',
          height: '64px',
          objectFit: 'contain',
          filter: 'drop-shadow(0 0 24px rgba(88, 166, 255, 0.15))',
        }}
      />
      <span style={{ fontSize: '11px', fontFamily: 'var(--font-ui, system-ui)', letterSpacing: '0.08em', textTransform: 'uppercase' as const }}>
        Loading…
      </span>
    </div>
  );
}
