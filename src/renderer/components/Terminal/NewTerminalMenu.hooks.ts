import type React from 'react';
import { useEffect, useRef, useState } from 'react';

import type { CodexModelOption, ModelProvider } from '../../types/electron';

export interface ModelOption {
  value: string;
  label: string;
  group: string;
}

const ANTHROPIC_MODELS: ModelOption[] = [
  { value: 'opus[1m]', label: 'Opus 4.6 (1M)', group: 'Anthropic' },
  { value: 'opus', label: 'Opus 4.6 (200K)', group: 'Anthropic' },
  { value: 'sonnet', label: 'Sonnet 4.6 (200K)', group: 'Anthropic' },
  { value: 'haiku', label: 'Haiku 4.5 (200K)', group: 'Anthropic' },
];

function buildAllModelOptions(providers: ModelProvider[]): ModelOption[] {
  return [
    ...ANTHROPIC_MODELS,
    ...providers
      .filter((provider) => provider.enabled && provider.models.length > 0)
      .flatMap((provider) =>
        provider.models.map((model) => ({
          value: `${provider.id}:${model.id}`,
          label: `${provider.name} / ${model.name}`,
          group: provider.name,
        })),
      ),
  ];
}

export function useClaudeModels(): ModelOption[] {
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

export function useCodexModels(): CodexModelOption[] {
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

export function groupByName(models: ModelOption[]): Map<string, ModelOption[]> {
  const groups = new Map<string, ModelOption[]>();
  for (const model of models) {
    const list = groups.get(model.group) ?? [];
    list.push(model);
    groups.set(model.group, list);
  }
  return groups;
}

export function useMenuPosition(
  anchorRef: React.RefObject<HTMLButtonElement | null>,
): { top: number; left: number } | null {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  useEffect(() => {
    if (!anchorRef.current) return;
    const rect = anchorRef.current.getBoundingClientRect();
    setPos({ top: rect.bottom + 2, left: rect.left });
  }, [anchorRef]);
  return pos;
}

export function useMenuDismiss(
  menuRef: React.RefObject<HTMLDivElement | null>,
  anchorRef: React.RefObject<HTMLButtonElement | null>,
  onClose: () => void,
): void {
  useEffect(() => {
    function handleClickOutside(e: MouseEvent): void {
      const target = e.target as Node;
      if (menuRef.current?.contains(target)) return;
      if (anchorRef.current?.contains(target)) return;
      onClose();
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [anchorRef, menuRef, onClose]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent): void {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);
}
