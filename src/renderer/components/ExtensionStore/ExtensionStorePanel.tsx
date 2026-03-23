/**
 * ExtensionStorePanel.tsx — Standalone overlay panel for browsing and installing
 * VS Code extensions from Open VSX. Triggered from TitleBar icon.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

import { CLOSE_ALL_STORE_PANELS_EVENT,OPEN_EXTENSION_STORE_EVENT } from '../../hooks/appEventNames';
import { ExtensionStoreSection } from '../Settings/ExtensionStoreSection';

const KEYFRAMES = `
  @keyframes ext-overlay-in {
    from { opacity: 0; }
    to   { opacity: 1; }
  }
  @keyframes ext-overlay-out {
    from { opacity: 1; }
    to   { opacity: 0; }
  }
  @keyframes ext-card-in {
    from { opacity: 0; transform: translateX(20px); }
    to   { opacity: 1; transform: translateX(0); }
  }
  @keyframes ext-card-out {
    from { opacity: 1; transform: translateX(0); }
    to   { opacity: 0; transform: translateX(20px); }
  }
`;

export function ExtensionStorePanel(): React.ReactElement | null {
  const [isMounted, setIsMounted] = useState(false);
  const [isVisible, setIsVisible] = useState(false);

  const open = useCallback(() => {
    // Close any other store panels first
    window.dispatchEvent(new CustomEvent(CLOSE_ALL_STORE_PANELS_EVENT));
    setIsMounted(true);
    requestAnimationFrame(() => setIsVisible(true));
  }, []);

  const close = useCallback(() => {
    setIsVisible(false);
    setTimeout(() => setIsMounted(false), 200);
  }, []);

  useEffect(() => {
    const handler = () => {
      if (isMounted) close();
      else open();
    };
    window.addEventListener(OPEN_EXTENSION_STORE_EVENT, handler);
    return () => window.removeEventListener(OPEN_EXTENSION_STORE_EVENT, handler);
  }, [isMounted, open, close]);

  // Close when another store panel opens
  useEffect(() => {
    if (!isMounted) return;
    const handler = () => close();
    window.addEventListener(CLOSE_ALL_STORE_PANELS_EVENT, handler);
    return () => window.removeEventListener(CLOSE_ALL_STORE_PANELS_EVENT, handler);
  }, [isMounted, close]);

  // Escape to close
  useEffect(() => {
    if (!isMounted) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); close(); }
    };
    document.addEventListener('keydown', handler, true);
    return () => document.removeEventListener('keydown', handler, true);
  }, [isMounted, close]);

  if (!isMounted) return null;

  return createPortal(
    <ExtensionStoreOverlay isVisible={isVisible} onClose={close} />,
    document.body,
  );
}

function ExtensionStoreHeader({ onClose }: { onClose: () => void }): React.ReactElement {
  return (
    <div className="border-b border-border-semantic" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', flexShrink: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <ExtensionIcon />
        <span className="text-text-semantic-primary" style={{ fontSize: '13px', fontWeight: 600 }}>Extension Store</span>
      </div>
      <button onClick={onClose} className="text-text-semantic-muted" style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '18px', lineHeight: 1, padding: '2px 6px', borderRadius: '4px' }} title="Close (Esc)">&times;</button>
    </div>
  );
}

function ExtensionStoreOverlay({ isVisible, onClose }: { isVisible: boolean; onClose: () => void }): React.ReactElement {
  return (
    <>
      <style>{KEYFRAMES}</style>
      <div
        role="dialog" aria-modal="true" aria-label="Extension Store"
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        style={{
          position: 'fixed', top: 'env(titlebar-area-height, 32px)', left: 0, right: 0, bottom: 0, zIndex: 10000,
          display: 'flex', justifyContent: 'flex-end', backgroundColor: 'rgba(0, 0, 0, 0.5)', backdropFilter: 'blur(2px)',
          animation: isVisible ? 'ext-overlay-in 180ms ease forwards' : 'ext-overlay-out 180ms ease forwards',
        }}
      >
        <div className="bg-surface-base border-l border-border-semantic" style={{
          width: '520px', maxWidth: '90vw', height: '100%', display: 'flex', flexDirection: 'column',
          boxShadow: '-8px 0 32px rgba(0,0,0,0.4)',
          animation: isVisible ? 'ext-card-in 200ms ease forwards' : 'ext-card-out 200ms ease forwards',
        }}>
          <ExtensionStoreHeader onClose={onClose} />
          <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}><ExtensionStoreSection /></div>
        </div>
      </div>
    </>
  );
}

function ExtensionIcon(): React.ReactElement {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" className="text-interactive-accent">
      <path d="M9 2v3a1 1 0 001 1h3" />
      <path d="M4 2H2.5A1.5 1.5 0 001 3.5v10A1.5 1.5 0 002.5 15h7a1.5 1.5 0 001.5-1.5V6L7 2H4z" />
      <path d="M5 9h4M5 11.5h2.5" />
      <rect x="10" y="1" width="5" height="5" rx="1" />
      <path d="M12.5 2.5v2M11.5 3.5h2" />
    </svg>
  );
}
