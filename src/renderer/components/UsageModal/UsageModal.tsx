import React, { memo, useCallback, useEffect, useState } from 'react';

import type { UsageSummary } from '../../types/electron';
import { UsageModalContent, UsageModalHeader, UsageRangeControls } from './UsageModalSections';
import { getTimeSince, type TimeRange } from './usageModalUtils';

interface UsageModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const UsageModal = memo(function UsageModal({ isOpen, onClose }: UsageModalProps): React.JSX.Element | null {
  const [range, setRange] = useState<TimeRange>('30d');
  const { error, isLoading, loadUsage, summary } = useUsageSummary(isOpen, range);

  useEscapeToClose(isOpen, onClose);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)', backdropFilter: 'blur(2px)' }}
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <div
        className="flex flex-col rounded-lg shadow-2xl overflow-hidden bg-surface-panel border border-border-semantic"
        style={{ width: '560px', maxHeight: '80vh', fontFamily: 'var(--font-ui)' }}
      >
        <UsageModalHeader onClose={onClose} />
        <UsageRangeControls range={range} onRangeChange={setRange} onRefresh={() => void loadUsage(range)} />
        <UsageModalContent summary={summary} isLoading={isLoading} error={error} onRetry={() => void loadUsage(range)} />
      </div>
    </div>
  );
});

function useUsageSummary(isOpen: boolean, range: TimeRange): {
  error: string | null;
  isLoading: boolean;
  loadUsage: (timeRange: TimeRange) => Promise<void>;
  summary: UsageSummary | null;
} {
  const [summary, setSummary] = useState<UsageSummary | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadUsage = useCallback(async (timeRange: TimeRange) => {
    if (!window.electronAPI?.usage?.getSummary) {
      setError('Usage API not available');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const result = await window.electronAPI.usage.getSummary({ since: getTimeSince(timeRange), maxSessions: 200 });
      if (result.success && result.summary) {
        setSummary(result.summary);
        return;
      }
      setError(result.error ?? 'Failed to load usage data');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      void loadUsage(range);
    }
  }, [isOpen, range, loadUsage]);

  return { error, isLoading, loadUsage, summary };
}

function useEscapeToClose(isOpen: boolean, onClose: () => void): void {
  useEffect(() => {
    if (!isOpen) return undefined;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
    }

    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [isOpen, onClose]);
}

export default UsageModal;
