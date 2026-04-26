import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import type { CodexModelOption } from '../../types/electron';

function useAnchoredOverlay(args: {
  menuRef: React.RefObject<HTMLDivElement | null>;
  anchorRef: React.RefObject<HTMLButtonElement | null>;
  onClose: () => void;
  updatePosition: () => void;
}): void {
  useEffect(() => {
    function handleClickOutside(event: MouseEvent): void {
      const target = event.target as Node;
      if (args.menuRef.current?.contains(target)) return;
      if (args.anchorRef.current?.contains(target)) return;
      args.onClose();
    }
    function handleKey(event: KeyboardEvent): void {
      if (event.key === 'Escape') args.onClose();
    }
    function handleWindowChange(): void {
      args.updatePosition();
    }

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKey);
    window.addEventListener('resize', handleWindowChange);
    window.addEventListener('scroll', handleWindowChange, true);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKey);
      window.removeEventListener('resize', handleWindowChange);
      window.removeEventListener('scroll', handleWindowChange, true);
    };
  }, [args]);
}

function useCodexModels(): CodexModelOption[] {
  const [models, setModels] = useState<CodexModelOption[]>([]);
  const loadedRef = useRef(false);

  useEffect(() => {
    if (loadedRef.current) return;
    if (typeof window === 'undefined' || !('electronAPI' in window)) return;
    loadedRef.current = true;
    window.electronAPI.codex
      .listModels()
      .then(setModels)
      .catch(() => {});
  }, []);

  return models;
}

function useCodexMenuPosition(
  anchorRef: React.RefObject<HTMLButtonElement | null>,
  menuRef: React.RefObject<HTMLDivElement | null>,
  onClose: () => void,
): { left: number; top: number; width: number } | null {
  const [menuPos, setMenuPos] = useState<{ left: number; top: number; width: number } | null>(null);
  const updateMenuPos = useCallback(() => {
    const rect = anchorRef.current?.getBoundingClientRect();
    if (!rect) return;
    setMenuPos({ left: rect.left, top: rect.bottom + 2, width: Math.max(rect.width, 220) });
  }, [anchorRef]);
  useAnchoredOverlay({ menuRef, anchorRef, onClose, updatePosition: updateMenuPos });
  useEffect(() => {
    updateMenuPos();
  }, [updateMenuPos]);
  return menuPos;
}

function CodexMenuItems({ models, onSelect }: { models: CodexModelOption[]; onSelect: (id: string) => void }): React.ReactElement {
  return (
    <>
      <div className="px-2 py-1 text-[9px] font-medium uppercase tracking-wider text-text-semantic-muted">
        Select Codex model
      </div>
      {models.map((model) => (
        <button
          key={model.id}
          role="menuitem"
          className="w-full cursor-pointer px-3 py-1 text-left text-[11px] text-text-semantic-primary transition-colors duration-100 hover:bg-surface-raised"
          onClick={() => onSelect(model.id)}
          title={model.description}
        >
          {model.name}
        </button>
      ))}
    </>
  );
}

function CodexMenuPanel({
  menuRef,
  menuPos,
  models,
  onSelect,
}: {
  menuRef: React.RefObject<HTMLDivElement | null>;
  menuPos: { left: number; top: number; width: number };
  models: CodexModelOption[];
  onSelect: (id: string) => void;
}): React.ReactElement {
  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      className="z-[9999] max-h-[280px] overflow-y-auto rounded border border-border-semantic bg-surface-overlay py-1 shadow-xl"
      style={{
        position: 'fixed',
        left: menuPos.left,
        top: menuPos.top,
        width: menuPos.width,
        fontFamily: 'var(--font-ui)',
        backdropFilter: 'blur(24px) saturate(140%)',
        WebkitBackdropFilter: 'blur(24px) saturate(140%)',
        ...({ WebkitAppRegion: 'no-drag' } as React.CSSProperties),
      }}
    >
      <CodexMenuItems models={models} onSelect={onSelect} />
    </div>,
    document.body,
  );
}

export function CodexModelMenu({
  anchorRef,
  onSelect,
  onClose,
}: {
  anchorRef: React.RefObject<HTMLButtonElement | null>;
  onSelect: (value: string) => void;
  onClose: () => void;
}): React.ReactElement {
  const menuRef = useRef<HTMLDivElement>(null);
  const models = useCodexModels();
  const menuPos = useCodexMenuPosition(anchorRef, menuRef, onClose);
  const handleSelect = useCallback(
    (value: string) => {
      onSelect(value);
      onClose();
    },
    [onClose, onSelect],
  );
  if (!menuPos) return <></>;
  return (
    <CodexMenuPanel menuRef={menuRef} menuPos={menuPos} models={models} onSelect={handleSelect} />
  );
}
