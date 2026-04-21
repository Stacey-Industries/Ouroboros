/**
 * ClaudeModelMenu — dropdown for selecting a model when spawning a Claude terminal.
 * Shown on right-click of the Claude button in TerminalTabs.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import type { ModelProvider } from '../../types/electron';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ModelOption {
  value: string;
  label: string;
  group: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const ANTHROPIC_MODELS: ModelOption[] = [
  { value: '', label: 'Auto', group: 'Anthropic' },
  { value: 'opus[1m]', label: 'Opus 4.7 (1M)', group: 'Anthropic' },
  { value: 'opus', label: 'Opus 4.7 (200K)', group: 'Anthropic' },
  { value: 'sonnet', label: 'Sonnet 4.6 (200K)', group: 'Anthropic' },
  { value: 'haiku', label: 'Haiku 4.5 (200K)', group: 'Anthropic' },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Extract a short display name from a provider:model string or alias. */
export function shortModelName(modelId: string): string {
  if (typeof modelId !== 'string' || !modelId) return '';
  if (modelId.includes(':')) {
    const part = modelId.slice(modelId.indexOf(':') + 1);
    return part.length > 18 ? `${part.slice(0, 16)}\u2026` : part;
  }
  if (modelId.includes('opus')) return 'Opus';
  if (modelId.includes('haiku')) return 'Haiku';
  if (modelId.includes('sonnet')) return 'Sonnet';
  return modelId;
}

function buildAllModelOptions(providers: ModelProvider[]): ModelOption[] {
  const providerModels = providers
    .filter((p) => p.enabled && p.models.length > 0)
    .flatMap((p) =>
      p.models.map((m) => ({
        value: `${p.id}:${m.id}`,
        label: `${p.name} / ${m.name}`,
        group: p.name,
      })),
    );
  return [...ANTHROPIC_MODELS, ...providerModels];
}

function groupByName(models: ModelOption[]): Map<string, ModelOption[]> {
  const groups = new Map<string, ModelOption[]>();
  for (const m of models) {
    const list = groups.get(m.group) ?? [];
    list.push(m);
    groups.set(m.group, list);
  }
  return groups;
}

// ─── Hooks ───────────────────────────────────────────────────────────────────

function useModelMenuData(): ModelOption[] {
  const [models, setModels] = useState<ModelOption[]>(ANTHROPIC_MODELS);
  const loadedRef = useRef(false);

  useEffect(() => {
    if (loadedRef.current) return;
    if (typeof window === 'undefined' || !('electronAPI' in window)) return;
    loadedRef.current = true;
    window.electronAPI.config
      .get('modelProviders')
      .then((providers: ModelProvider[]) => {
        if (providers?.length) setModels(buildAllModelOptions(providers));
      })
      .catch(() => {});
  }, []);

  return models;
}

function useAnchoredOverlay(args: {
  menuRef: React.RefObject<HTMLDivElement | null>;
  anchorRef: React.RefObject<HTMLButtonElement | null>;
  onClose: () => void;
  updatePosition: () => void;
}): void {
  useEffect(() => {
    function handleClickOutside(e: MouseEvent): void {
      const target = e.target as Node;
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

// ─── Components ──────────────────────────────────────────────────────────────

function ModelMenuGroup({
  group,
  items,
  onSelect,
}: {
  group: string;
  items: ModelOption[];
  onSelect: (value: string) => void;
}): React.ReactElement {
  return (
    <div>
      <div className="px-2 py-0.5 text-[9px] font-medium uppercase tracking-wider text-text-semantic-muted opacity-60">
        {group}
      </div>
      {items.map((m) => (
        <button
          key={m.value}
          role="menuitem"
          className="w-full text-left px-3 py-1 text-[11px] text-text-semantic-primary hover:bg-surface-raised transition-colors duration-100 cursor-pointer"
          onClick={() => onSelect(m.value)}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}

export function ClaudeModelMenu({
  anchorRef,
  onSelect,
  onClose,
}: {
  anchorRef: React.RefObject<HTMLButtonElement | null>;
  onSelect: (value: string) => void;
  onClose: () => void;
}): React.ReactElement {
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuPos, setMenuPos] = useState<{ left: number; top: number; width: number } | null>(null);
  const models = useModelMenuData();
  const groups = groupByName(models);

  const updateMenuPos = useCallback(() => {
    const rect = anchorRef.current?.getBoundingClientRect();
    if (!rect) return;
    setMenuPos({ left: rect.left, top: rect.bottom + 2, width: Math.max(rect.width, 180) });
  }, [anchorRef]);
  useAnchoredOverlay({ menuRef, anchorRef, onClose, updatePosition: updateMenuPos });
  useEffect(() => {
    updateMenuPos();
  }, [updateMenuPos]);

  const handleSelect = useCallback(
    (value: string) => {
      onSelect(value);
      onClose();
    },
    [onSelect, onClose],
  );

  if (!menuPos) {
    return <></>;
  }

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
      <div className="px-2 py-1 text-[9px] font-medium uppercase tracking-wider text-text-semantic-muted">
        Select model
      </div>
      {Array.from(groups.entries()).map(([group, items]) => (
        <ModelMenuGroup key={group} group={group} items={items} onSelect={handleSelect} />
      ))}
    </div>,
    document.body,
  );
}
