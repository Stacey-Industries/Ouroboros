import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import type { UsageWindowSnapshot } from '../../types/electron';
import { USAGE_REFRESH_MS } from '../UsageModal/UsagePanelShared';
import { UsageDropdown } from './TitleBar.usage.parts';

interface UsageActionsProps {
  UsageIcon: () => React.ReactElement;
  onOpenPanel: () => void;
  titleButtonStyle: React.CSSProperties;
  hoverStyle: Pick<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onMouseEnter' | 'onMouseLeave'>;
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
  dropdownRef: React.RefObject<HTMLDivElement | null>,
  isOpen: boolean,
  onClose: () => void,
): void {
  useEffect(() => {
    if (!isOpen) return;

    function handleMouseDown(event: MouseEvent): void {
      const target = event.target as Node;
      const insideTrigger = ref.current?.contains(target);
      const insideDropdown = dropdownRef.current?.contains(target);
      if (!insideTrigger && !insideDropdown) onClose();
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
  }, [dropdownRef, isOpen, onClose, ref]);
}

function UsagePanelButton({
  UsageIcon,
  closeDropdown,
  hoverStyle,
  onOpenPanel,
  titleButtonStyle,
}: Pick<UsageActionsProps, 'UsageIcon' | 'hoverStyle' | 'onOpenPanel' | 'titleButtonStyle'> & {
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
  buttonRef,
  handleToggle,
  hoverStyle,
  titleButtonStyle,
}: Pick<UsageActionsProps, 'hoverStyle' | 'titleButtonStyle'> & {
  handleToggle: () => void;
  buttonRef: React.RefObject<HTMLButtonElement | null>;
}): React.ReactElement {
  return (
    <button
      ref={buttonRef}
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

function useUsageActionsState(
  snapshot: UsageWindowSnapshot | null,
  loadSnapshot: () => Promise<void>,
  setIsLoading: React.Dispatch<React.SetStateAction<boolean>>,
): {
  open: boolean;
  anchorRect: DOMRect | null;
  closeDropdown: () => void;
  handleToggle: () => void;
  toggleButtonRef: React.RefObject<HTMLButtonElement | null>;
} {
  const [open, setOpen] = useState(false);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  const toggleButtonRef = useRef<HTMLButtonElement>(null);
  const updateAnchorRect = useCallback(() => {
    setAnchorRect(toggleButtonRef.current?.getBoundingClientRect() ?? null);
  }, []);
  const closeDropdown = useCallback(() => setOpen(false), []);
  const handleToggle = useCallback(() => {
    if (!open) {
      setIsLoading(snapshot === null);
      void loadSnapshot();
      updateAnchorRect();
    }
    setOpen((current) => !current);
  }, [loadSnapshot, open, setIsLoading, snapshot, updateAnchorRect]);
  useEffect(() => {
    if (!open) return;
    updateAnchorRect();
    window.addEventListener('resize', updateAnchorRect);
    window.addEventListener('scroll', updateAnchorRect, true);
    return () => {
      window.removeEventListener('resize', updateAnchorRect);
      window.removeEventListener('scroll', updateAnchorRect, true);
    };
  }, [open, updateAnchorRect]);
  return { open, anchorRect, closeDropdown, handleToggle, toggleButtonRef };
}

export function UsageActions({ UsageIcon, onOpenPanel, titleButtonStyle, hoverStyle }: UsageActionsProps): React.ReactElement {
  const containerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { error, isLoading, loadSnapshot, setIsLoading, snapshot } = useUsageWindowSnapshot();
  const { open, anchorRect, closeDropdown, handleToggle, toggleButtonRef } = useUsageActionsState(snapshot, loadSnapshot, setIsLoading);
  useDismissableDropdown(containerRef, dropdownRef, open, closeDropdown);
  return (
    <div ref={containerRef} className="titlebar-no-drag"
      style={{ position: 'relative', display: 'flex', alignItems: 'stretch', height: '100%' }}
    >
      <UsagePanelButton UsageIcon={UsageIcon} closeDropdown={closeDropdown} hoverStyle={hoverStyle} onOpenPanel={onOpenPanel} titleButtonStyle={titleButtonStyle} />
      <UsageWindowToggleButton buttonRef={toggleButtonRef} handleToggle={handleToggle} hoverStyle={hoverStyle} titleButtonStyle={titleButtonStyle} />
      {open && createPortal(
        <UsageDropdown snapshot={snapshot} isLoading={isLoading} error={error} anchorRect={anchorRect} alignRight={true} dropdownRef={dropdownRef} />,
        document.body,
      )}
    </div>
  );
}
