import React, { memo } from 'react';
import type { AgentTemplate } from '../../types/electron';
import type { SessionSlot } from './useMultiSessionLauncherModel';
import { MAX_SLOTS } from './useMultiSessionLauncherModel';
import {
  AddSessionButton,
  CloseIcon,
  IconButton,
  LaunchAllButton,
  MultiSessionGridIcon,
  SlotCounter,
  SlotEditorHeader,
  SlotOverrides,
  SlotPromptField,
} from './MultiSessionLauncherControls';

export const SlotEditor = memo(function SlotEditor({
  canRemove,
  index,
  onRemove,
  onUpdate,
  slot,
  templates,
}: {
  canRemove: boolean;
  index: number;
  onRemove: (id: string) => void;
  onUpdate: (id: string, updates: Partial<SessionSlot>) => void;
  slot: SessionSlot;
  templates: AgentTemplate[];
}): React.ReactElement {
  return (
    <div className="flex flex-col gap-2 rounded p-3" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
      <SlotEditorHeader
        canRemove={canRemove}
        index={index}
        onRemove={onRemove}
        onUpdate={onUpdate}
        slot={slot}
        templates={templates}
      />
      {slot.templateId === '__custom__' ? <SlotPromptField index={index} onUpdate={onUpdate} slot={slot} /> : null}
      <SlotOverrides index={index} onUpdate={onUpdate} slot={slot} />
    </div>
  );
});

export function LauncherHeader({ onClose }: { onClose: () => void }): React.ReactElement {
  return (
    <div className="flex shrink-0 items-center gap-2 px-3 py-2" style={{ borderBottom: '1px solid var(--border)' }}>
      <MultiSessionGridIcon />
      <span className="flex-1 text-xs font-semibold" style={{ color: 'var(--text)' }}>
        Multi-Session Launch
      </span>
      <IconButton
        ariaLabel="Close multi-session launcher"
        defaultColor="var(--text-faint)"
        hoverColor="var(--text)"
        onClick={onClose}
        title="Close"
      >
        <CloseIcon />
      </IconButton>
    </div>
  );
}

export function LauncherFooter({
  canLaunch,
  onAddSlot,
  onLaunchAll,
  slotsLength,
}: {
  canLaunch: boolean;
  onAddSlot: () => void;
  onLaunchAll: () => void;
  slotsLength: number;
}): React.ReactElement {
  return (
    <div className="flex shrink-0 items-center gap-2 px-3 py-2" style={{ borderTop: '1px solid var(--border)' }}>
      <AddSessionButton canAddSlot={slotsLength < MAX_SLOTS} onAddSlot={onAddSlot} />
      <span className="flex-1" />
      <SlotCounter slotsLength={slotsLength} />
      <LaunchAllButton canLaunch={canLaunch} onLaunchAll={onLaunchAll} />
    </div>
  );
}
