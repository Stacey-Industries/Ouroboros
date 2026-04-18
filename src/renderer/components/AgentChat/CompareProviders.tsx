/**
 * CompareProviders.tsx — Wave 36 Phase F
 *
 * Orchestrator for the compare-providers side-by-side mode.
 * Gated on providers.multiProvider === true (caller checks before rendering).
 *
 * Desktop: modal dialog with two side-by-side output panes.
 * Mobile:  stacked layout inside MobileBottomSheet.
 */

import React, { useCallback, useState } from 'react';

import { useCompareSession } from '../../hooks/useCompareSession';
import { useViewportBreakpoint } from '../../hooks/useViewportBreakpoint';
import { MobileBottomSheet } from '../Layout/MobileBottomSheet';
import { CompareProvidersDiff } from './CompareProvidersDiff';
import type { ProviderOption } from './CompareProvidersHeader';
import { CompareProvidersHeader } from './CompareProvidersHeader';
import { CompareProvidersOutputPane } from './CompareProvidersOutputPane';

// ─── Constants ────────────────────────────────────────────────────────────────

const PROVIDER_OPTIONS: ProviderOption[] = [
  { id: 'claude', label: 'Claude' },
  { id: 'codex', label: 'Codex' },
  { id: 'gemini', label: 'Gemini' },
];

const OVERLAY_STYLE: React.CSSProperties = {
  position: 'fixed', inset: 0, zIndex: 300,
  background: 'rgba(0,0,0,0.45)', // hardcoded: scrim opacity overlay — not a semantic color
  display: 'flex', alignItems: 'center', justifyContent: 'center',
};

const MODAL_STYLE: React.CSSProperties = {
  background: 'var(--surface-overlay)', borderRadius: '8px',
  border: '1px solid var(--border-semantic)',
  width: '90vw', maxWidth: '1100px', height: '75vh',
  display: 'flex', flexDirection: 'column', overflow: 'hidden',
};

// ─── Spend warning ─────────────────────────────────────────────────────────────

const WARNING_STYLE: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  padding: '8px 12px', fontSize: '12px',
  background: 'var(--status-warning-subtle)',
  borderBottom: '1px solid var(--border-subtle)',
  color: 'var(--text-semantic-secondary)', flexShrink: 0,
};

function SpendWarning({ onDismiss }: { onDismiss: () => void }): React.ReactElement {
  return (
    <div style={WARNING_STYLE} role="note">
      <span>Running two providers doubles API spend.</span>
      <button onClick={onDismiss} style={{ background: 'none', border: 'none',
        cursor: 'pointer', color: 'var(--text-semantic-muted)', fontSize: '12px' }}>
        Dismiss
      </button>
    </div>
  );
}

// ─── Inner content ─────────────────────────────────────────────────────────────

interface ContentProps {
  state: ReturnType<typeof useCompareSession>['state'];
  prompt: string; setPrompt: (v: string) => void;
  providerIdA: string; providerIdB: string;
  setProviderIdA: (v: string) => void; setProviderIdB: (v: string) => void;
  warningDismissed: boolean; onDismissWarning: () => void;
  showDiff: boolean; setShowDiff: (v: boolean) => void;
  isRunning: boolean; onRun: () => void; onCancel: () => void;
  isMobile: boolean;
}

function CompareContent(p: ContentProps): React.ReactElement {
  const panesStyle: React.CSSProperties = p.isMobile
    ? { display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, gap: '8px', padding: '8px', overflow: 'hidden' }
    : { display: 'flex', flex: 1, minHeight: 0, gap: '8px', padding: '8px', overflow: 'hidden' };
  const labelA = PROVIDER_OPTIONS.find((o) => o.id === p.providerIdA)?.label ?? p.providerIdA;
  const labelB = PROVIDER_OPTIONS.find((o) => o.id === p.providerIdB)?.label ?? p.providerIdB;
  const bothDone = p.state.status === 'completed';
  return (
    <div className="flex flex-col h-full min-h-0">
      {!p.warningDismissed && <SpendWarning onDismiss={p.onDismissWarning} />}
      <CompareProvidersHeader
        prompt={p.prompt} onPromptChange={p.setPrompt}
        providerIdA={p.providerIdA} providerIdB={p.providerIdB}
        onProviderAChange={p.setProviderIdA} onProviderBChange={p.setProviderIdB}
        providers={PROVIDER_OPTIONS} isRunning={p.isRunning}
        onRun={p.onRun} onCancel={p.onCancel}
      />
      {p.showDiff
        ? <CompareProvidersDiff textA={p.state.paneA.text} textB={p.state.paneB.text} labelA={labelA} labelB={labelB} />
        : <div style={panesStyle}>
            <CompareProvidersOutputPane {...p.state.paneA} label={labelA} />
            <CompareProvidersOutputPane {...p.state.paneB} label={labelB} />
          </div>
      }
      {bothDone && !p.showDiff && (
        <div style={{ padding: '8px 12px', borderTop: '1px solid var(--border-subtle)',
          display: 'flex', justifyContent: 'flex-end', flexShrink: 0 }}>
          <button onClick={() => p.setShowDiff(true)}
            style={{ padding: '5px 14px', borderRadius: '4px', border: 'none',
              background: 'var(--interactive-accent)', color: 'var(--text-on-accent)',
              fontSize: '13px', cursor: 'pointer' }}>
            Show diff
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Public API ────────────────────────────────────────────────────────────────

export interface CompareProvidersProps {
  isOpen: boolean;
  onClose: () => void;
  projectPath: string;
}

export function CompareProviders({ isOpen, onClose, projectPath }: CompareProvidersProps): React.ReactElement | null {
  const viewport = useViewportBreakpoint();
  const { state, start, cancel } = useCompareSession();
  const [prompt, setPrompt] = useState('');
  const [providerIdA, setProviderIdA] = useState('claude');
  const [providerIdB, setProviderIdB] = useState('codex');
  const [warningDismissed, setWarningDismissed] = useState(false);
  const [showDiff, setShowDiff] = useState(false);

  const onRun = useCallback(() => {
    setShowDiff(false);
    void start({ prompt, projectPath, providerIds: [providerIdA, providerIdB] });
  }, [prompt, projectPath, providerIdA, providerIdB, start]);

  const onCancel = useCallback(() => { void cancel(); }, [cancel]);

  if (!isOpen) return null;
  const isMobile = viewport === 'phone';
  const isRunning = state.status === 'running' || state.status === 'starting';
  const contentProps: ContentProps = {
    state, prompt, setPrompt, providerIdA, providerIdB,
    setProviderIdA, setProviderIdB, warningDismissed,
    onDismissWarning: () => setWarningDismissed(true),
    showDiff, setShowDiff, isRunning, onRun, onCancel, isMobile,
  };

  if (isMobile) {
    return (
      <MobileBottomSheet isOpen={isOpen} onClose={onClose} ariaLabel="Compare providers">
        <CompareContent {...contentProps} />
      </MobileBottomSheet>
    );
  }
  return (
    <div style={OVERLAY_STYLE} onClick={onClose}>
      <div style={MODAL_STYLE} onClick={(e) => e.stopPropagation()}
        role="dialog" aria-modal="true" aria-label="Compare providers">
        <CompareContent {...contentProps} />
      </div>
    </div>
  );
}
