import { useCallback, useEffect, useState } from 'react';
import type { AgentTemplate, ClaudeCliSettings } from '../../types/electron';
import { resolveTemplate } from '../../utils/templateResolver';

export interface SessionSlot {
  id: string;
  templateId: string | '__custom__';
  customPrompt: string;
  modelOverride: string;
  effortOverride: string;
}

interface LaunchEntry {
  cliOverrides?: Partial<ClaudeCliSettings>;
  label: string;
  prompt: string;
}

export const MAX_SLOTS = 4;

function createSlot(): SessionSlot {
  return {
    id: `slot-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
    templateId: '__custom__',
    customPrompt: '',
    modelOverride: '',
    effortOverride: '',
  };
}

function buildLaunchEntry(
  slot: SessionSlot,
  templates: AgentTemplate[],
  projectRoot: string | null,
): LaunchEntry | null {
  const projectName = projectRoot?.replace(/\\/g, '/').split('/').pop() ?? '';
  const ctx = {
    projectRoot,
    projectName,
    openFile: null as string | null,
    openFileName: null as string | null,
  };

  if (slot.templateId === '__custom__') {
    const prompt = slot.customPrompt.trim();
    if (!prompt) {
      return null;
    }

    return {
      label: prompt.slice(0, 40) + (prompt.length > 40 ? '...' : ''),
      prompt,
    };
  }

  const template = templates.find((candidate) => candidate.id === slot.templateId);
  if (!template) {
    return null;
  }

  return {
    cliOverrides: template.cliOverrides ? { ...template.cliOverrides } : undefined,
    label: template.name,
    prompt: resolveTemplate(template.promptTemplate, ctx),
  };
}

function applySlotOverrides(
  slot: SessionSlot,
  cliOverrides?: Partial<ClaudeCliSettings>,
): Partial<ClaudeCliSettings> | undefined {
  if (!slot.modelOverride && !slot.effortOverride) {
    return cliOverrides;
  }

  const nextOverrides = cliOverrides ? { ...cliOverrides } : {};
  if (slot.modelOverride) {
    nextOverrides.model = slot.modelOverride;
  }
  if (slot.effortOverride) {
    nextOverrides.effort = slot.effortOverride;
  }
  return nextOverrides;
}

function dispatchLaunch(entry: LaunchEntry): void {
  window.dispatchEvent(new CustomEvent('agent-ide:spawn-claude-template', {
    detail: {
      prompt: entry.prompt,
      label: entry.label,
      cliOverrides: entry.cliOverrides,
    },
  }));
}

function isLaunchableSlot(slot: SessionSlot): boolean {
  return slot.templateId !== '__custom__' || slot.customPrompt.trim().length > 0;
}

function launchSlots(
  slots: SessionSlot[],
  templates: AgentTemplate[],
  projectRoot: string | null,
): string[] {
  return slots.flatMap((slot) => {
    const entry = buildLaunchEntry(slot, templates, projectRoot);
    if (!entry) {
      return [];
    }

    const finalEntry = {
      ...entry,
      cliOverrides: applySlotOverrides(slot, entry.cliOverrides),
    };
    dispatchLaunch(finalEntry);
    return [finalEntry.label];
  });
}

function useAgentTemplates(): AgentTemplate[] {
  const [templates, setTemplates] = useState<AgentTemplate[]>([]);

  useEffect(() => {
    window.electronAPI?.config?.get('agentTemplates')
      .then((items) => {
        if (items) {
          setTemplates(items);
        }
      })
      .catch(() => {
        setTemplates([]);
      });
  }, []);

  return templates;
}

function useSessionSlots(): {
  slots: SessionSlot[];
  handleAddSlot: () => void;
  handleRemove: (id: string) => void;
  handleUpdate: (id: string, updates: Partial<SessionSlot>) => void;
} {
  const [slots, setSlots] = useState<SessionSlot[]>(() => [createSlot(), createSlot()]);

  const handleUpdate = useCallback((id: string, updates: Partial<SessionSlot>) => {
    setSlots((previous) => previous.map((slot) => (
      slot.id === id ? { ...slot, ...updates } : slot
    )));
  }, []);

  const handleRemove = useCallback((id: string) => {
    setSlots((previous) => previous.filter((slot) => slot.id !== id));
  }, []);

  const handleAddSlot = useCallback(() => {
    setSlots((previous) => (
      previous.length >= MAX_SLOTS ? previous : [...previous, createSlot()]
    ));
  }, []);

  return { slots, handleAddSlot, handleRemove, handleUpdate };
}

export function useMultiSessionLauncherModel(
  onLaunched: (sessionLabels: string[]) => void,
  projectRoot: string | null,
): {
  canLaunch: boolean;
  slots: SessionSlot[];
  templates: AgentTemplate[];
  handleAddSlot: () => void;
  handleLaunchAll: () => void;
  handleRemove: (id: string) => void;
  handleUpdate: (id: string, updates: Partial<SessionSlot>) => void;
} {
  const templates = useAgentTemplates();
  const { slots, handleAddSlot, handleRemove, handleUpdate } = useSessionSlots();

  const handleLaunchAll = useCallback(() => {
    const labels = launchSlots(slots, templates, projectRoot);

    if (labels.length > 0) {
      onLaunched(labels);
    }
  }, [onLaunched, projectRoot, slots, templates]);

  return {
    canLaunch: slots.some(isLaunchableSlot),
    handleAddSlot,
    handleLaunchAll,
    handleRemove,
    handleUpdate,
    slots,
    templates,
  };
}
