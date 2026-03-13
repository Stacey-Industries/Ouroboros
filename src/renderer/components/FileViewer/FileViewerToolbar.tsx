import React, { memo } from 'react';
import { ToolbarButton } from './ToolbarButton';

export interface FileViewerToolbarProps {
  wordWrap: boolean;
  setWordWrap: (updater: boolean | ((prev: boolean) => boolean)) => void;
  showMinimap: boolean;
  setShowMinimap: (updater: boolean | ((prev: boolean) => boolean)) => void;
  showBlame: boolean;
  setShowBlame: (updater: boolean | ((prev: boolean) => boolean)) => void;
  showOutline: boolean;
  setShowOutline: (updater: boolean | ((prev: boolean) => boolean)) => void;
  showHistory: boolean;
  setShowHistory: (updater: boolean | ((prev: boolean) => boolean)) => void;
  projectRoot?: string | null;
  editMode: boolean;
  setEditMode: (value: boolean) => void;
  isDirty?: boolean;
  onSave?: (content: string) => void;
  onDirtyChange?: (dirty: boolean) => void;
  isClaudeMd: boolean;
  claudeMdEnhanced: boolean;
  setClaudeMdEnhanced: (updater: boolean | ((prev: boolean) => boolean)) => void;
}

const containerStyle: React.CSSProperties = {
  flexShrink: 0,
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  padding: '3px 12px',
  borderBottom: '1px solid var(--border-muted)',
  backgroundColor: 'var(--bg-secondary)',
  userSelect: 'none',
};

/**
 * Toolbar with toggle buttons for word wrap, minimap, blame, outline,
 * history, and edit mode.
 */
export const FileViewerToolbar = memo(function FileViewerToolbar(
  props: FileViewerToolbarProps
): React.ReactElement {
  return (
    <div style={containerStyle}>
      <ViewerToggleButtons props={props} />
      <div style={{ flex: 1 }} />
      <EditControls
        editMode={props.editMode}
        setEditMode={props.setEditMode}
        isDirty={props.isDirty}
        onSave={props.onSave}
        onDirtyChange={props.onDirtyChange}
        isClaudeMd={props.isClaudeMd}
        claudeMdEnhanced={props.claudeMdEnhanced}
        setClaudeMdEnhanced={props.setClaudeMdEnhanced}
      />
    </div>
  );
});

interface ToolbarToggleDefinition {
  label: string;
  active: boolean;
  onClick: () => void;
  title: string;
}

function ViewerToggleButtons({
  props,
}: {
  props: FileViewerToolbarProps;
}): React.ReactElement {
  const buttons = getToolbarToggleButtons(props);

  return (
    <>
      {buttons.map((button) => (
        <ToolbarButton key={button.label} {...button} />
      ))}
    </>
  );
}

function getToolbarToggleButtons(
  props: FileViewerToolbarProps
): ToolbarToggleDefinition[] {
  const buttons: ToolbarToggleDefinition[] = [
    {
      label: 'Wrap',
      active: props.wordWrap,
      onClick: () => props.setWordWrap(toggleBoolean),
      title: 'Toggle word wrap (Alt+Z)',
    },
    {
      label: 'Minimap',
      active: props.showMinimap,
      onClick: () => props.setShowMinimap(toggleBoolean),
      title: 'Toggle minimap',
    },
    {
      label: 'Blame',
      active: props.showBlame,
      onClick: () => props.setShowBlame(toggleBoolean),
      title: 'Toggle git blame annotations',
    },
    {
      label: 'Outline',
      active: props.showOutline,
      onClick: () => props.setShowOutline(toggleBoolean),
      title: 'Toggle symbol outline',
    },
  ];

  if (props.projectRoot) {
    buttons.push({
      label: 'History',
      active: props.showHistory,
      onClick: () => props.setShowHistory(toggleBoolean),
      title: 'Toggle commit history for this file',
    });
  }

  return buttons;
}

function toggleBoolean(value: boolean): boolean {
  return !value;
}

interface EditControlsProps {
  editMode: boolean;
  setEditMode: (value: boolean) => void;
  isDirty?: boolean;
  onSave?: (content: string) => void;
  onDirtyChange?: (dirty: boolean) => void;
  isClaudeMd: boolean;
  claudeMdEnhanced: boolean;
  setClaudeMdEnhanced: (updater: boolean | ((prev: boolean) => boolean)) => void;
}

function EditControls(props: EditControlsProps): React.ReactElement | null {
  if (!props.onSave) return null;

  const handleToggleEdit = () => {
    if (props.editMode && props.isDirty) {
      const confirmed = window.confirm('You have unsaved changes. Discard them?');
      if (!confirmed) return;
      props.onDirtyChange?.(false);
    }
    props.setEditMode(!props.editMode);
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
      {props.isDirty && <DirtyIndicator />}
      <ToolbarButton
        label={props.editMode ? 'Exit Edit' : 'Edit'}
        active={props.editMode}
        onClick={handleToggleEdit}
        title={props.editMode ? 'Exit edit mode' : 'Edit file'}
      />
      {props.isClaudeMd && props.editMode && (
        <ToolbarButton
          label={props.claudeMdEnhanced ? 'Enhanced' : 'Plain'}
          active={props.claudeMdEnhanced}
          onClick={() => props.setClaudeMdEnhanced(toggleBoolean)}
          title={
            props.claudeMdEnhanced
              ? 'Switch to plain editor'
              : 'Switch to enhanced CLAUDE.md editor'
          }
        />
      )}
    </div>
  );
}

function DirtyIndicator(): React.ReactElement {
  return (
    <span
      title="Unsaved changes"
      style={{
        display: 'inline-block',
        width: '6px',
        height: '6px',
        borderRadius: '50%',
        backgroundColor: 'var(--accent)',
      }}
    />
  );
}
