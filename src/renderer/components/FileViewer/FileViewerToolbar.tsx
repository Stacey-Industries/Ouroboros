import log from 'electron-log/renderer';
import React, { memo, useEffect, useRef } from 'react';

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
  currentContent?: string | null;
  isDirty?: boolean;
  onSave?: (content: string) => void;
  onCancelEdit?: () => void;
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
  borderBottom: '1px solid var(--border-subtle)',
  backgroundColor: 'var(--surface-panel)',
  userSelect: 'none',
};

/**
 * Toolbar with toggle buttons for word wrap, minimap, blame, outline,
 * history, and edit mode.
 */
export const FileViewerToolbar = memo(function FileViewerToolbar(
  props: FileViewerToolbarProps,
): React.ReactElement {
  return (
    <div style={containerStyle}>
      <ViewerToggleButtons props={props} />
      <EditControls
        editMode={props.editMode}
        setEditMode={props.setEditMode}
        currentContent={props.currentContent}
        isDirty={props.isDirty}
        onSave={props.onSave}
        onCancelEdit={props.onCancelEdit}
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

function ViewerToggleButtons({ props }: { props: FileViewerToolbarProps }): React.ReactElement {
  const buttons = getToolbarToggleButtons(props);

  return (
    <>
      {buttons.map((button) => (
        <ToolbarButton key={button.label} {...button} />
      ))}
    </>
  );
}

function getToolbarToggleButtons(props: FileViewerToolbarProps): ToolbarToggleDefinition[] {
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
  currentContent?: string | null;
  isDirty?: boolean;
  onSave?: (content: string) => void;
  onCancelEdit?: () => void;
  isClaudeMd: boolean;
  claudeMdEnhanced: boolean;
  setClaudeMdEnhanced: (updater: boolean | ((prev: boolean) => boolean)) => void;
}

function confirmDiscardChanges(isDirty?: boolean): boolean {
  if (!isDirty) {
    return true;
  }
  return window.confirm('Discard your unsaved changes?');
}

type EditModeButtonsProps = Pick<
  EditControlsProps,
  'currentContent' | 'isDirty' | 'onSave' | 'onCancelEdit' | 'setEditMode'
>;

function makeSaveHandler(
  currentContent: string | null | undefined,
  onSave: ((content: string) => void) | undefined,
  setEditMode: (value: boolean) => void,
): () => void {
  return () => {
    if (currentContent == null) return;
    onSave?.(currentContent);
    setEditMode(false);
  };
}

function makeCancelHandler(
  isDirty: boolean | undefined,
  onCancelEdit: (() => void) | undefined,
  setEditMode: (value: boolean) => void,
): () => void {
  return () => {
    if (!confirmDiscardChanges(isDirty)) return;
    onCancelEdit?.();
    setEditMode(false);
  };
}

function EditModeButtons({
  currentContent,
  isDirty,
  onSave,
  onCancelEdit,
  setEditMode,
}: EditModeButtonsProps): React.ReactElement {
  const handleSave = makeSaveHandler(currentContent, onSave, setEditMode);
  const handleCancel = makeCancelHandler(isDirty, onCancelEdit, setEditMode);
  return (
    <>
      <ToolbarButton
        label="Save"
        active={Boolean(isDirty)}
        onClick={handleSave}
        title="Save changes"
      />
      <ToolbarButton
        label="Cancel"
        active={false}
        onClick={handleCancel}
        title="Discard draft and exit edit mode"
      />
    </>
  );
}

function ClaudeMdToggle({
  claudeMdEnhanced,
  setClaudeMdEnhanced,
}: Pick<EditControlsProps, 'claudeMdEnhanced' | 'setClaudeMdEnhanced'>): React.ReactElement {
  return (
    <ToolbarButton
      label={claudeMdEnhanced ? 'Enhanced' : 'Plain'}
      active={claudeMdEnhanced}
      onClick={() => setClaudeMdEnhanced(toggleBoolean)}
      title={claudeMdEnhanced ? 'Switch to plain editor' : 'Switch to enhanced CLAUDE.md editor'}
    />
  );
}

// Wave 82.1 — measure the Edit/Exit button on every render. Goal: tell apart
// "React rendered the button but CSS hides/zeroes it" (computed style) vs
// "button is rendered with normal box and an overlay sits on top" (rect ok).
// Logged on each render, including the post-Exit render where the button is
// reportedly invisible despite identical DOM.
function rectSummary(el: Element | null | undefined): object | null {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right };
}

function logButtonMeasurement(btn: HTMLButtonElement, editMode: boolean): void {
  const rect = btn.getBoundingClientRect();
  const cs = window.getComputedStyle(btn);
  // Wave 82.1 — also capture the ancestor chain so we can tell whether the
  // toolbar / its containing pane are widening on edit toggle (which would
  // explain Edit button moving from x:1206 to x:1300 between initial and
  // post-exit renders).
  const editControlsEl = btn.parentElement;
  const toolbarEl = editControlsEl?.parentElement;
  const chromeRootEl = toolbarEl?.parentElement;
  const paneEl = chromeRootEl?.parentElement;
  log.info('[trace:EditBtn] measure', {
    editMode,
    rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
    editControlsRect: rectSummary(editControlsEl),
    toolbarRect: rectSummary(toolbarEl),
    chromeRootRect: rectSummary(chromeRootEl),
    paneRect: rectSummary(paneEl),
    display: cs.display,
    visibility: cs.visibility,
    opacity: cs.opacity,
    color: cs.color,
    backgroundColor: cs.backgroundColor,
    borderColor: cs.borderColor,
    title: btn.title,
    textContent: btn.textContent,
  });
}

function useEditButtonMeasure(
  ref: React.RefObject<HTMLDivElement | null>,
  editMode: boolean,
  enabled: boolean,
): void {
  useEffect(() => {
    if (!enabled) return;
    const id = requestAnimationFrame(() => {
      const btn = ref.current?.querySelector<HTMLButtonElement>('button');
      if (!btn) {
        log.warn('[trace:EditBtn] measure: button not found', {
          containerExists: Boolean(ref.current),
          editMode,
        });
        return;
      }
      logButtonMeasurement(btn, editMode);
    });
    return () => cancelAnimationFrame(id);
  });
}

function EditControls(props: EditControlsProps): React.ReactElement | null {
  log.info('[trace:EditBtn] EditControls render', {
    hasOnSave: Boolean(props.onSave),
    editMode: props.editMode,
  });
  const containerRef = useRef<HTMLDivElement>(null);
  useEditButtonMeasure(containerRef, props.editMode, Boolean(props.onSave));
  if (!props.onSave) return null;

  return (
    <div ref={containerRef} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
      {props.isDirty && <DirtyIndicator />}
      <ToolbarButton
        label={props.editMode ? 'Exit' : 'Edit'}
        active={props.editMode}
        onClick={() => {
          log.info('[trace:FileViewer] Edit/Exit toolbar click', { wasEditMode: props.editMode });
          props.setEditMode(!props.editMode);
        }}
        title={props.editMode ? 'Exit edit mode' : 'Edit file'}
      />
      {props.editMode && (
        <EditModeButtons
          currentContent={props.currentContent}
          isDirty={props.isDirty}
          onSave={props.onSave}
          onCancelEdit={props.onCancelEdit}
          setEditMode={props.setEditMode}
        />
      )}
      {props.isClaudeMd && props.editMode && (
        <ClaudeMdToggle
          claudeMdEnhanced={props.claudeMdEnhanced}
          setClaudeMdEnhanced={props.setClaudeMdEnhanced}
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
        backgroundColor: 'var(--interactive-accent)',
      }}
    />
  );
}
