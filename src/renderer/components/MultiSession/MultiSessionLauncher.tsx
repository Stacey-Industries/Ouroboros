/**
 * MultiSessionLauncher.tsx â€” Modal/panel for configuring and launching parallel Claude Code sessions.
 */

import React, { memo } from 'react';

import { useProject } from '../../contexts/ProjectContext';
import { LauncherFooter, LauncherHeader, SlotEditor } from './MultiSessionLauncherParts';
import { useMultiSessionLauncherModel } from './useMultiSessionLauncherModel';

export interface MultiSessionLauncherProps {
  onClose: () => void;
  onLaunched: (sessionLabels: string[]) => void;
}

export const MultiSessionLauncher = memo(function MultiSessionLauncher({
  onClose,
  onLaunched,
}: MultiSessionLauncherProps): React.JSX.Element {
  const { projectRoot } = useProject();
  const model = useMultiSessionLauncherModel(onLaunched, projectRoot);

  return (
    <div className="flex h-full flex-col bg-surface-base">
      <LauncherHeader onClose={onClose} />
      <div
        className="flex-1 overflow-y-auto px-3 py-2"
        style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}
      >
        {model.slots.map((slot, index) => (
          <SlotEditor
            key={slot.id}
            canRemove={model.slots.length > 1}
            index={index}
            onRemove={model.handleRemove}
            onUpdate={model.handleUpdate}
            slot={slot}
            templates={model.templates}
          />
        ))}
      </div>
      <LauncherFooter
        canLaunch={model.canLaunch}
        onAddSlot={model.handleAddSlot}
        onLaunchAll={model.handleLaunchAll}
        slotsLength={model.slots.length}
      />
    </div>
  );
});
