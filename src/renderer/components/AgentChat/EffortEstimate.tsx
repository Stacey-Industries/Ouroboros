/**
 * EffortEstimate.tsx — Cost + latency estimate pill shown near the composer send button.
 *
 * Wave 26 Phase C.
 *
 * Displays a small pill like "~3.2s / $0.024" that refreshes (debounced 300ms) when
 * the draft or active profile changes. Calls `profileCrud:estimate` IPC.
 */

import React, { useEffect, useRef, useState } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface EstimateState {
  estimatedMs: number;
  estimatedUsd: number;
}

// ─── Formatters ───────────────────────────────────────────────────────────────

function formatMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `~${(ms / 1000).toFixed(1)}s`;
}

function formatUsd(usd: number): string {
  if (usd < 0.001) return '<$0.001';
  if (usd < 0.01) return `$${usd.toFixed(3)}`;
  return `$${usd.toFixed(2)}`;
}

// ─── Hook: debounced estimate fetch ──────────────────────────────────────────

const DEBOUNCE_MS = 300;

function useEstimate(profileId: string | null, contextTokens: number): EstimateState | null {
  const [estimate, setEstimate] = useState<EstimateState | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!profileId) {
      setEstimate(null);
      return;
    }

    if (timerRef.current !== null) clearTimeout(timerRef.current);

    timerRef.current = setTimeout(() => {
      window.electronAPI.profileCrud
        .estimate({ profileId, contextTokens })
        .then((res) => {
          if (res.success && res.estimatedMs !== undefined && res.estimatedUsd !== undefined) {
            setEstimate({ estimatedMs: res.estimatedMs, estimatedUsd: res.estimatedUsd });
          }
        })
        .catch(() => undefined);
    }, DEBOUNCE_MS);

    return () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    };
  }, [profileId, contextTokens]);

  return estimate;
}

// ─── Component ────────────────────────────────────────────────────────────────

export interface EffortEstimateProps {
  /** Active profile ID. When null/undefined, the pill is hidden. */
  profileId: string | null | undefined;
  /** Estimated input token count for the current turn. */
  contextTokens: number;
}

export function EffortEstimate({
  profileId,
  contextTokens,
}: EffortEstimateProps): React.ReactElement | null {
  const estimate = useEstimate(profileId ?? null, contextTokens);

  if (!profileId || estimate === null) return null;

  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] text-text-semantic-faint"
      style={{
        background: 'var(--surface-inset)',
        border: '1px solid var(--border-subtle)',
        fontFamily: 'var(--font-mono)',
        whiteSpace: 'nowrap',
      }}
      title="Estimated latency / cost for this turn (heuristic)"
    >
      {formatMs(estimate.estimatedMs)} / {formatUsd(estimate.estimatedUsd)}
    </span>
  );
}
