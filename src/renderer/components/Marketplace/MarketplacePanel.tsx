/**
 * MarketplacePanel.tsx — curated signed bundle marketplace.
 *
 * Wave 37 Phase D. Fetches manifest on open, renders bundle list with install
 * buttons, shows offline indicator when manifest fetch fails, and toasts on
 * install success / failure (with signature-reject reason).
 *
 * Command palette entry: marketplace:open → dispatches agent-ide:open-marketplace.
 * Mobile path: wraps in MobileBottomSheet when viewport < 768 px.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';

import { useToastContext } from '../../contexts/ToastContext';
import { OPEN_MARKETPLACE_EVENT } from '../../hooks/appEventNames';
import type { BundleManifestEntry } from '../../types/electron-marketplace';
import { MobileBottomSheet } from '../Layout/MobileBottomSheet';
import { BundleCard } from './BundleCard';

// ── Types ─────────────────────────────────────────────────────────────────────

type PanelState = 'idle' | 'loading' | 'ready' | 'offline';

// ── Hook: data fetching ───────────────────────────────────────────────────────

function useMarketplaceData(isOpen: boolean): {
  bundles: BundleManifestEntry[];
  state: PanelState;
  reload: () => void;
} {
  const [bundles, setBundles] = useState<BundleManifestEntry[]>([]);
  const [state, setState] = useState<PanelState>('idle');
  const loadedRef = useRef(false);

  const load = useCallback(async () => {
    setState('loading');
    loadedRef.current = true;
    const result = await window.electronAPI.marketplace.listBundles();
    if (!result.success || !result.bundles) {
      setState('offline');
      return;
    }
    setBundles(result.bundles);
    setState('ready');
  }, []);

  useEffect(() => {
    if (isOpen && !loadedRef.current) { void load(); }
  }, [isOpen, load]);

  return { bundles, state, reload: load };
}

// ── Hook: install action ──────────────────────────────────────────────────────

function useInstall(): (entryId: string, title: string) => Promise<void> {
  const { toast } = useToastContext();
  return useCallback(async (entryId: string, title: string) => {
    const result = await window.electronAPI.marketplace.install({ entryId });
    if (result.success) {
      toast(`"${title}" installed.`, 'success');
    } else {
      const reason = result.error === 'invalid-signature'
        ? 'Signature invalid — bundle rejected'
        : (result.error ?? 'Install failed');
      toast(reason, 'error');
    }
  }, [toast]);
}

// ── Sub-components ────────────────────────────────────────────────────────────

function OfflineBanner(): React.ReactElement {
  return (
    <div className="flex flex-col items-center gap-2 py-8 text-text-semantic-muted text-sm">
      <span className="text-status-warning text-base">Offline</span>
      <span>Could not reach the marketplace. Check your connection.</span>
    </div>
  );
}

function LoadingSpinner(): React.ReactElement {
  return (
    <div className="flex items-center justify-center py-10 text-text-semantic-muted text-sm">
      Loading marketplace…
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

interface MarketplacePanelBodyProps {
  onClose: () => void;
}

function MarketplacePanelBody({ onClose }: MarketplacePanelBodyProps): React.ReactElement {
  const [isOpen, setIsOpen] = useState(true);
  const { bundles, state, reload } = useMarketplaceData(isOpen);
  const install = useInstall();

  useEffect(() => { setIsOpen(true); }, []);

  return (
    <div className="flex flex-col h-full bg-surface-panel">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border-subtle">
        <span className="text-text-semantic-primary font-medium text-sm">Marketplace</span>
        <div className="flex items-center gap-2">
          {state === 'offline' && (
            <button onClick={reload} className="text-xs text-interactive-accent hover:underline">
              Retry
            </button>
          )}
          <button
            onClick={onClose}
            aria-label="Close marketplace"
            className="text-text-semantic-muted hover:text-text-semantic-primary text-lg leading-none"
          >
            ×
          </button>
        </div>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto p-3">
        {state === 'loading' && <LoadingSpinner />}
        {state === 'offline' && <OfflineBanner />}
        {state === 'ready' && bundles.length === 0 && (
          <p className="text-text-semantic-muted text-sm py-6 text-center">
            No bundles available.
          </p>
        )}
        {state === 'ready' && bundles.map((b) => (
          <BundleCard key={b.id} entry={b} onInstall={install} />
        ))}
      </div>
    </div>
  );
}

// ── Public export ─────────────────────────────────────────────────────────────

export interface MarketplacePanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export function MarketplacePanel({ isOpen, onClose }: MarketplacePanelProps): React.ReactElement | null {
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;

  if (!isOpen) return null;

  if (isMobile) {
    return (
      <MobileBottomSheet isOpen={isOpen} onClose={onClose} ariaLabel="Marketplace">
        <MarketplacePanelBody onClose={onClose} />
      </MobileBottomSheet>
    );
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Marketplace"
      className="fixed inset-0 z-50 flex items-center justify-center bg-surface-overlay/60"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-[520px] max-h-[70vh] flex flex-col rounded-lg shadow-lg overflow-hidden border border-border-subtle bg-surface-panel">
        <MarketplacePanelBody onClose={onClose} />
      </div>
    </div>
  );
}

// ── DOM event listener hook (for command palette integration) ─────────────────

export function useMarketplacePanelEvent(open: () => void): void {
  useEffect(() => {
    const handler = () => open();
    window.addEventListener(OPEN_MARKETPLACE_EVENT, handler);
    return () => window.removeEventListener(OPEN_MARKETPLACE_EVENT, handler);
  }, [open]);
}
