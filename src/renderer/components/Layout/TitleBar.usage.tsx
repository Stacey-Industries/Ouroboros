import React, { useCallback, useEffect, useRef, useState } from 'react';

import type { UsageWindowSnapshot } from '../../types/electron';
import { USAGE_REFRESH_MS } from '../UsageModal/UsagePanelShared';
import { UsageDropdown } from './TitleBar.usage.parts';

interface UsageActionsProps {
  UsageIcon: () => React.ReactElement;
  onOpenPanel: () => void;
  titleButtonStyle: React.CSSProperties;
  hoverStyle: Pick<
    React.ButtonHTMLAttributes<HTMLButtonElement>,
    'onMouseEnter' | 'onMouseLeave'
  >;
}

async function fetchUsageWindowSnapshot(): Promise<{
  snapshot: UsageWindowSnapshot | null;
  error: string | null;
}> {
  const api = window.electronAPI?.usage;
  if (!api?.getUsageWindowSnapshot) {
    return { snapshot: null, error: 'Usage snapshot unavailable' };
  }

  try {
    const result = await api.getUsageWindowSnapshot();
    if (!result.success) {
      return { snapshot: null, error: result.error ?? 'Failed to load usage snapshot' };
    }
    return { snapshot: result.snapshot ?? null, error: null };
  } catch {
    return { snapshot: null, error: 'Failed to load usage snapshot' };
  }
}

function useUsageWindowSnapshot(): {
  error: string | null;
  isLoading: boolean;
  loadSnapshot: () => Promise<void>;
  setIsLoading: React.Dispatch<React.SetStateAction<boolean>>;
  snapshot: UsageWindowSnapshot | null;
} {
  const [snapshot, setSnapshot] = useState<UsageWindowSnapshot | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadSnapshot = useCallback(async () => {
    const result = await fetchUsageWindowSnapshot();
    if (result.snapshot) setSnapshot(result.snapshot);
    setError(result.snapshot ? null : result.error);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    void loadSnapshot();
    const interval = setInterval(() => void loadSnapshot(), USAGE_REFRESH_MS);
    return () => clearInterval(interval);
  }, [loadSnapshot]);

  return { error, isLoading, loadSnapshot, setIsLoading, snapshot };
}

function useDismissableDropdown(
  ref: React.RefObject<HTMLDivElement | null>,
  isOpen: boolean,
  onClose: () => void,
): void {
  useEffect(() => {
    if (!isOpen) return;

    function handleMouseDown(event: MouseEvent): void {
      if (ref.current && !ref.current.contains(event.target as Node)) onClose();
    }

    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') onClose();
    }

    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose, ref]);
}

function UsagePanelButton({
  UsageIcon,
  closeDropdown,
  hoverStyle,
  onOpenPanel,
  titleButtonStyle,
}: Pick<
  UsageActionsProps,
  'UsageIcon' | 'hoverStyle' | 'onOpenPanel' | 'titleButtonStyle'
> & {
  closeDropdown: () => void;
}): React.ReactElement {
  return (
    <button
      className="titlebar-no-drag text-text-semantic-muted"
      title="Usage (Ctrl+U)"
      onClick={() => {
        closeDropdown();
        onOpenPanel();
      }}
      style={titleButtonStyle}
      {...hoverStyle}
    >
      <UsageIcon />
    </button>
  );
}

function UsageWindowToggleButton({
  handleToggle,
  hoverStyle,
  titleButtonStyle,
}: Pick<UsageActionsProps, 'hoverStyle' | 'titleButtonStyle'> & {
  handleToggle: () => void;
}): React.ReactElement {
  return (
    <button
      className="titlebar-no-drag text-text-semantic-muted"
      title="Usage windows"
      aria-label="Usage windows"
      onClick={handleToggle}
      style={{
        ...titleButtonStyle,
        width: '18px',
        borderLeft: '1px solid color-mix(in srgb, var(--border-semantic) 35%, transparent)',
      }}
      {...hoverStyle}
    >
      <svg
        width="12"
        height="12"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <polyline points="4,6 8,10 12,6" />
      </svg>
    </button>
  );
}

export function UsageActions({
  UsageIcon,
  onOpenPanel,
  titleButtonStyle,
  hoverStyle,
}: UsageActionsProps): React.ReactElement {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const { error, isLoading, loadSnapshot, setIsLoading, snapshot } = useUsageWindowSnapshot();
  const closeDropdown = useCallback(() => setOpen(false), []);

  useDismissableDropdown(containerRef, open, closeDropdown);

  const handleToggle = useCallback(() => {
    if (!open) {
      setIsLoading(snapshot === null);
      void loadSnapshot();
    }
    setOpen((current) => !current);
  }, [loadSnapshot, open, setIsLoading, snapshot]);

  return (
    <div
      ref={containerRef}
      className="titlebar-no-drag"
      style={{ position: 'relative', display: 'flex', alignItems: 'stretch', height: '100%' }}
    >
      <UsagePanelButton
        UsageIcon={UsageIcon}
        closeDropdown={closeDropdown}
        hoverStyle={hoverStyle}
        onOpenPanel={onOpenPanel}
        titleButtonStyle={titleButtonStyle}
      />
      <UsageWindowToggleButton
        handleToggle={handleToggle}
        hoverStyle={hoverStyle}
        titleButtonStyle={titleButtonStyle}
      />
      {open && <UsageDropdown snapshot={snapshot} isLoading={isLoading} error={error} />}
    </div>
  );
}
