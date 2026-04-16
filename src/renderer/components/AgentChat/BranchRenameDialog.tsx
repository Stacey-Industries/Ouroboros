/**
 * BranchRenameDialog.tsx — Wave 23 Phase B
 *
 * Small modal for renaming a branch thread.
 * Calls window.electronAPI.agentChat.renameBranch(threadId, name) on save.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export interface BranchRenameDialogProps {
  threadId: string;
  currentName: string;
  onClose: () => void;
  /** Called after a successful rename so callers can refresh state. */
  onRenamed: (threadId: string, newName: string) => void;
}

// ── Keyboard / focus trap ─────────────────────────────────────────────────────

function useDialogKeyboard(onClose: () => void): void {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent): void {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);
}

// ── Dialog content ────────────────────────────────────────────────────────────

interface DialogContentProps {
  currentName: string;
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onSave: (name: string) => void;
}

function useDialogForm(
  currentName: string,
  onSave: (name: string) => void,
): {
  name: string;
  inputRef: React.RefObject<HTMLInputElement | null>;
  handleSubmit: (e: React.FormEvent) => void;
  setName: (v: string) => void;
} {
  const [name, setName] = useState(currentName);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const trimmed = name.trim();
      if (!trimmed) return;
      onSave(trimmed);
    },
    [name, onSave],
  );

  return { name, inputRef, handleSubmit, setName };
}

function DialogFormButtons({
  saving,
  nameIsEmpty,
  onClose,
}: {
  saving: boolean;
  nameIsEmpty: boolean;
  onClose: () => void;
}): React.ReactElement {
  return (
    <div className="flex justify-end gap-2">
      <button
        type="button"
        onClick={onClose}
        disabled={saving}
        className="rounded px-3 py-1 text-xs text-text-semantic-muted transition-colors duration-75 hover:text-text-semantic-primary"
      >
        Cancel
      </button>
      <button
        type="submit"
        disabled={saving || nameIsEmpty}
        className="rounded bg-interactive-accent px-3 py-1 text-xs text-text-on-accent transition-opacity duration-75 disabled:opacity-50"
      >
        {saving ? 'Saving…' : 'Save'}
      </button>
    </div>
  );
}

function BranchNameInput({
  inputRef,
  name,
  saving,
  onChange,
}: {
  inputRef: React.RefObject<HTMLInputElement | null>;
  name: string;
  saving: boolean;
  onChange: (v: string) => void;
}): React.ReactElement {
  return (
    <input
      ref={inputRef}
      type="text"
      value={name}
      onChange={(e) => onChange(e.target.value)}
      className="mb-3 w-full rounded border border-border-subtle bg-surface-inset px-2.5 py-1.5 text-sm text-text-semantic-primary outline-none focus:border-interactive-accent"
      placeholder="Branch name"
      maxLength={80}
      disabled={saving}
      aria-label="Branch name"
    />
  );
}

function DialogContent({
  currentName,
  saving,
  error,
  onClose,
  onSave,
}: DialogContentProps): React.ReactElement {
  const { name, inputRef, handleSubmit, setName } = useDialogForm(currentName, onSave);

  return (
    <div
      className="rounded-lg border border-border-semantic bg-surface-overlay p-4 shadow-lg"
      style={{ width: 320 }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="rename-dialog-title"
    >
      <h3 id="rename-dialog-title" className="mb-3 text-sm font-medium text-text-semantic-primary">
        Rename branch
      </h3>
      <form onSubmit={handleSubmit}>
        <BranchNameInput inputRef={inputRef} name={name} saving={saving} onChange={setName} />
        {error && <p className="mb-2 text-xs text-status-error" role="alert">{error}</p>}
        <DialogFormButtons saving={saving} nameIsEmpty={!name.trim()} onClose={onClose} />
      </form>
    </div>
  );
}

// ── Save logic ────────────────────────────────────────────────────────────────

function useBranchRenameSave(
  threadId: string,
  onClose: () => void,
  onRenamed: (threadId: string, newName: string) => void,
): { saving: boolean; error: string | null; handleSave: (name: string) => void } {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = useCallback(
    (name: string) => {
      setSaving(true);
      setError(null);
      window.electronAPI.agentChat
        .renameBranch(threadId, name)
        .then((result) => {
          if (result.success) {
            onRenamed(threadId, name);
            onClose();
          } else {
            setError(result.error ?? 'Rename failed');
          }
        })
        .catch((err: unknown) => {
          setError(err instanceof Error ? err.message : 'Rename failed');
        })
        .finally(() => setSaving(false));
    },
    [threadId, onClose, onRenamed],
  );

  return { saving, error, handleSave };
}

// ── Main export ───────────────────────────────────────────────────────────────

export function BranchRenameDialog({
  threadId,
  currentName,
  onClose,
  onRenamed,
}: BranchRenameDialogProps): React.ReactElement {
  const { saving, error, handleSave } = useBranchRenameSave(threadId, onClose, onRenamed);
  useDialogKeyboard(onClose);

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      aria-hidden="false"
    >
      <DialogContent
        currentName={currentName}
        saving={saving}
        error={error}
        onClose={onClose}
        onSave={handleSave}
      />
    </div>,
    document.body,
  );
}
