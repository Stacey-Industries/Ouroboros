/**
 * SettingsModalFrame.tsx — ModalOverlay and ModalCard shell components.
 * Split from SettingsModalParts.tsx to keep both files under 300 lines.
 */

import React from 'react';

interface ModalFrameProps {
  children: React.ReactNode;
  isVisible: boolean;
  onCancel: () => void;
}

export function ModalOverlay({
  children,
  isVisible,
  onCancel,
}: ModalFrameProps): React.ReactElement {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Settings"
      onClick={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
        backdropFilter: 'blur(2px)',
        padding: '24px',
        animation: isVisible
          ? 'settings-overlay-in 180ms ease forwards'
          : 'settings-overlay-out 180ms ease forwards',
      }}
    >
      {children}
    </div>
  );
}

export function ModalCard({
  children,
  isVisible,
}: Omit<ModalFrameProps, 'onCancel'>): React.ReactElement {
  return (
    <div
      role="document"
      style={{
        width: '100%',
        maxWidth: '680px',
        maxHeight: 'calc(100vh - 48px)',
        display: 'flex',
        flexDirection: 'column',
        borderRadius: '10px',
        background: 'var(--surface-base)',
        border: '1px solid var(--border-default)',
        boxShadow: '0 32px 80px rgba(0, 0, 0, 0.7)',
        overflow: 'hidden',
        animation: isVisible
          ? 'settings-card-in 180ms ease forwards'
          : 'settings-card-out 180ms ease forwards',
      }}
    >
      {children}
    </div>
  );
}
