/**
 * DiffReviewHeaderActions.tsx — Action buttons in the diff review header.
 *
 * Extracted from DiffReviewPanelSections.tsx to keep that file under 300 lines.
 * Includes Accept All / Reject All / Close / Undo Last Accept / Export buttons.
 */

import React, { useRef, useState } from 'react';

import { buildPrDescriptionMarkdown } from './diffReviewExport';
import type { ReviewFile } from './types';

export interface DiffReviewHeaderActionsProps {
  allDecided: boolean;
  canRollback: boolean;
  enhancedEnabled: boolean;
  files: ReviewFile[];
  onAcceptAll: () => void;
  onClose: () => void;
  onRejectAll: () => void;
  onRollback: () => void;
}

function HeaderBtn({
  color,
  disabled,
  label,
  onClick,
  title,
}: {
  color: string;
  disabled?: boolean;
  label: string;
  onClick: () => void;
  title?: string;
}): React.ReactElement {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title={title}
      style={{
        padding: '2px 10px',
        fontSize: '0.6875rem',
        fontFamily: 'var(--font-ui)',
        fontWeight: 500,
        border: `1px solid ${color}`,
        borderRadius: '4px',
        background: hovered && !disabled ? color : 'transparent',
        color: hovered && !disabled ? 'var(--text-on-accent)' : color,
        cursor: disabled ? 'default' : 'pointer',
        lineHeight: '1.5',
        transition: 'background 0.1s, color 0.1s',
        opacity: disabled ? 0.4 : 1,
      }}
    >
      {label}
    </button>
  );
}

function ExportPopover({
  files,
  onClose,
}: {
  files: ReviewFile[];
  onClose: () => void;
}): React.ReactElement {
  const markdown = buildPrDescriptionMarkdown({ files });

  const handleCopy = () => {
    void navigator.clipboard.writeText(markdown);
    onClose();
  };

  const handleSave = () => {
    void window.electronAPI.app.saveFileDialog('pr-description.md', markdown);
    onClose();
  };

  return (
    <div
      style={{
        position: 'absolute',
        top: '100%',
        right: 0,
        marginTop: '4px',
        zIndex: 100,
        background: 'var(--surface-overlay)',
        border: '1px solid var(--border-default)',
        borderRadius: '6px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
        minWidth: '180px',
        overflow: 'hidden',
      }}
    >
      <PopoverItem label="Copy to clipboard" onClick={handleCopy} />
      <PopoverItem label="Save to file…" onClick={handleSave} />
    </div>
  );
}

function PopoverItem({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}): React.ReactElement {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'block',
        width: '100%',
        textAlign: 'left',
        padding: '7px 14px',
        fontSize: '0.75rem',
        fontFamily: 'var(--font-ui)',
        background: hovered ? 'var(--interactive-muted)' : 'transparent',
        color: 'var(--text-primary)',
        border: 'none',
        cursor: 'pointer',
      }}
    >
      {label}
    </button>
  );
}

function ExportButton({ files }: { files: ReviewFile[] }): React.ReactElement {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const hasDecisions = files.some(
    (f) => f.hunks.some((h) => h.decision === 'accepted' || h.decision === 'rejected'),
  );

  const handleToggle = () => setOpen((prev) => !prev);
  const handleClose = () => setOpen(false);

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <HeaderBtn
        label="Export"
        color="var(--interactive-accent)"
        disabled={!hasDecisions}
        onClick={handleToggle}
        title="Export PR description draft"
      />
      {open && <ExportPopover files={files} onClose={handleClose} />}
    </div>
  );
}

export function DiffReviewHeaderActions({
  allDecided,
  canRollback,
  enhancedEnabled,
  files,
  onAcceptAll,
  onClose,
  onRejectAll,
  onRollback,
}: DiffReviewHeaderActionsProps): React.ReactElement {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
      {enhancedEnabled && (
        <>
          <HeaderBtn
            label="Undo last accept"
            color="var(--interactive-accent)"
            disabled={!canRollback}
            onClick={onRollback}
            title="Move the most recently accepted hunks back to pending"
          />
          <ExportButton files={files} />
        </>
      )}
      {!allDecided && (
        <>
          <HeaderBtn label="Accept All" color="var(--status-success)" onClick={onAcceptAll} />
          <HeaderBtn label="Reject All" color="var(--status-error)" onClick={onRejectAll} />
        </>
      )}
      <HeaderBtn label={allDecided ? 'Done' : 'Close'} color="var(--interactive-accent)" onClick={onClose} />
    </div>
  );
}
