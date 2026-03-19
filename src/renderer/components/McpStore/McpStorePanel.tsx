/**
 * McpStorePanel.tsx — Standalone overlay panel for browsing and installing
 * MCP servers from the official registry. Triggered from TitleBar icon.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

import { CLOSE_ALL_STORE_PANELS_EVENT,OPEN_MCP_STORE_EVENT } from '../../hooks/appEventNames';
import { McpStoreSection } from '../Settings/McpStoreSection';

const KEYFRAMES = `
  @keyframes mcp-overlay-in {
    from { opacity: 0; }
    to   { opacity: 1; }
  }
  @keyframes mcp-overlay-out {
    from { opacity: 1; }
    to   { opacity: 0; }
  }
  @keyframes mcp-card-in {
    from { opacity: 0; transform: translateX(20px); }
    to   { opacity: 1; transform: translateX(0); }
  }
  @keyframes mcp-card-out {
    from { opacity: 1; transform: translateX(0); }
    to   { opacity: 0; transform: translateX(20px); }
  }
`;

export function McpStorePanel(): React.ReactElement | null {
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
    window.addEventListener(OPEN_MCP_STORE_EVENT, handler);
    return () => window.removeEventListener(OPEN_MCP_STORE_EVENT, handler);
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
    <>
      <style>{KEYFRAMES}</style>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="MCP Store"
        onClick={(e) => { if (e.target === e.currentTarget) close(); }}
        style={{
          position: 'fixed',
          top: 'env(titlebar-area-height, 32px)',
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 10000,
          display: 'flex',
          justifyContent: 'flex-end',
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          backdropFilter: 'blur(2px)',
          animation: isVisible
            ? 'mcp-overlay-in 180ms ease forwards'
            : 'mcp-overlay-out 180ms ease forwards',
        }}
      >
        <div
          style={{
            width: '520px',
            maxWidth: '90vw',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            backgroundColor: 'var(--bg)',
            borderLeft: '1px solid var(--border)',
            boxShadow: '-8px 0 32px rgba(0,0,0,0.4)',
            animation: isVisible
              ? 'mcp-card-in 200ms ease forwards'
              : 'mcp-card-out 200ms ease forwards',
          }}
        >
          {/* Header */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '12px 16px',
              borderBottom: '1px solid var(--border)',
              flexShrink: 0,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <McpIcon />
              <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)' }}>
                MCP Server Store
              </span>
            </div>
            <button
              onClick={close}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                fontSize: '18px',
                lineHeight: 1,
                padding: '2px 6px',
                borderRadius: '4px',
              }}
              title="Close (Esc)"
            >
              &times;
            </button>
          </div>

          {/* Content */}
          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: '16px',
            }}
          >
            <McpStoreSection />
          </div>
        </div>
      </div>
    </>,
    document.body,
  );
}

function McpIcon(): React.ReactElement {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--accent)' }}>
      <rect x="4" y="1" width="8" height="5" rx="1" />
      <rect x="4" y="10" width="8" height="5" rx="1" />
      <line x1="8" y1="6" x2="8" y2="10" />
      <circle cx="6" cy="3.5" r="0.5" fill="currentColor" stroke="none" />
      <circle cx="8" cy="3.5" r="0.5" fill="currentColor" stroke="none" />
      <circle cx="10" cy="3.5" r="0.5" fill="currentColor" stroke="none" />
      <circle cx="6" cy="12.5" r="0.5" fill="currentColor" stroke="none" />
      <circle cx="8" cy="12.5" r="0.5" fill="currentColor" stroke="none" />
      <circle cx="10" cy="12.5" r="0.5" fill="currentColor" stroke="none" />
    </svg>
  );
}
