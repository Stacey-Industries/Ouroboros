/**
 * ContextPreviewMemoryModals.tsx — Edit modal and delete confirmation dialog
 * for memory entries in the ContextPreview popover.
 *
 * EditMemoryModal: read-only name field, editable description / type / content.
 * DeleteMemoryConfirm: single confirmation step before delete.
 *
 * Both use optimistic UI: the parent applies the change immediately and reverts
 * if the IPC call fails.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';

import type { MemoryType, MemoryWriteFrontmatter } from '../../types/electron-memory';

const MEMORY_TYPES: MemoryType[] = ['user', 'feedback', 'project', 'reference'];

// ─── shared primitives ────────────────────────────────────────────────────────

function ModalBackdrop({ onClose }: { onClose: () => void }): React.ReactElement {
  return (
    <div
      className="fixed inset-0 z-50"
      style={{ backgroundColor: 'rgba(0,0,0,0.55)' }}
      onClick={onClose}
      aria-hidden="true"
    />
  );
}

function ModalBox({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed left-1/2 top-1/2 z-50 flex w-[480px] max-w-[92vw] -translate-x-1/2 -translate-y-1/2 flex-col rounded-lg border border-border-semantic bg-surface-panel shadow-lg"
      style={{ fontFamily: 'var(--font-ui)' }}
    >
      {children}
    </div>
  );
}

function ModalHeader({ title, onClose }: { title: string; onClose: () => void }): React.ReactElement {
  return (
    <div className="flex items-center justify-between border-b border-border-subtle px-4 py-3">
      <span className="text-[12px] font-medium text-text-semantic-primary">{title}</span>
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="text-text-semantic-muted transition-colors hover:text-text-semantic-primary"
      >
        &times;
      </button>
    </div>
  );
}

function FieldLabel({ text }: { text: string }): React.ReactElement {
  return <label className="mb-0.5 block text-[11px] font-medium text-text-semantic-secondary">{text}</label>;
}

function inputClass(extra = ''): string {
  return [
    'w-full rounded border border-border-subtle bg-surface-inset px-2 py-1 text-[11px]',
    'text-text-semantic-primary outline-none focus:border-interactive-accent focus:ring-0',
    extra,
  ].join(' ');
}

function ErrorAlert({ message }: { message: string }): React.ReactElement {
  return (
    <div className="text-[11px] text-status-error" role="alert">
      {message}
    </div>
  );
}

function ModalFooter({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <div className="flex justify-end gap-2 border-t border-border-subtle px-4 py-3">{children}</div>
  );
}

function CancelButton({ onClick }: { onClick: () => void }): React.ReactElement {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded border border-border-subtle px-3 py-1 text-[11px] text-text-semantic-secondary transition-colors hover:bg-surface-hover"
    >
      Cancel
    </button>
  );
}

function TypeSelect({ value, onChange }: { value: MemoryType; onChange: (v: MemoryType) => void }): React.ReactElement {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as MemoryType)}
      className={inputClass()}
      aria-label="Memory type"
    >
      {MEMORY_TYPES.map((t) => (
        <option key={t} value={t}>{t}</option>
      ))}
    </select>
  );
}

function useEscapeKey(onClose: () => void): void {
  useEffect(() => {
    const handler = (e: KeyboardEvent): void => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);
}

// ─── EditMemoryModal ──────────────────────────────────────────────────────────

export interface EditMemoryModalProps {
  id: string;
  initialDescription: string;
  initialType: MemoryType;
  initialContent: string;
  projectRoot?: string | null;
  onSaved: (id: string, description: string, type: MemoryType) => void;
  onClose: () => void;
}

interface EditFields {
  description: string;
  type: MemoryType;
  content: string;
}

function EditFieldsForm({ fields, onChange }: {
  fields: EditFields;
  onChange: (patch: Partial<EditFields>) => void;
}): React.ReactElement {
  const contentRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { contentRef.current?.focus(); }, []);
  return (
    <div className="flex flex-col gap-3 px-4 py-3">
      <div>
        <FieldLabel text="Name (read-only)" />
        <input type="text" value={fields.description} readOnly
          className={inputClass('opacity-60 cursor-default')} aria-label="Entry name read-only" />
      </div>
      <div>
        <FieldLabel text="Description" />
        <input type="text" value={fields.description}
          onChange={(e) => onChange({ description: e.target.value })}
          className={inputClass()} aria-label="Description" />
      </div>
      <div>
        <FieldLabel text="Type" />
        <TypeSelect value={fields.type} onChange={(v) => onChange({ type: v })} />
      </div>
      <div>
        <FieldLabel text="Content" />
        <textarea ref={contentRef} value={fields.content}
          onChange={(e) => onChange({ content: e.target.value })}
          rows={8} className={inputClass('resize-y')}
          style={{ fontFamily: 'var(--font-mono)' }} aria-label="Content" />
      </div>
    </div>
  );
}

function useEditSave(
  id: string,
  fields: EditFields,
  projectRoot: string | null | undefined,
  onSaved: (id: string, description: string, type: MemoryType) => void,
): { busy: boolean; error: string | null; save: () => void } {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = useCallback(() => {
    const api = window.electronAPI?.memory;
    if (!api?.write) return;
    setBusy(true);
    setError(null);
    const frontmatter: MemoryWriteFrontmatter = { description: fields.description, type: fields.type };
    void api.write({ projectRoot: projectRoot ?? undefined, id, content: fields.content, frontmatter })
      .then((res) => {
        setBusy(false);
        if (!res.success) { setError(res.error ?? 'Write failed'); return; }
        onSaved(id, fields.description, fields.type);
      });
  }, [id, fields, projectRoot, onSaved]);
  return { busy, error, save };
}

export function EditMemoryModal({
  id, initialDescription, initialType, initialContent, projectRoot, onSaved, onClose,
}: EditMemoryModalProps): React.ReactElement {
  const [fields, setFields] = useState<EditFields>({
    description: initialDescription,
    type: initialType,
    content: initialContent,
  });
  const patch = useCallback((p: Partial<EditFields>) => setFields((f) => ({ ...f, ...p })), []);
  const { busy, error, save } = useEditSave(id, fields, projectRoot, onSaved);
  useEscapeKey(onClose);
  return (
    <>
      <ModalBackdrop onClose={onClose} />
      <ModalBox>
        <ModalHeader title="Edit memory entry" onClose={onClose} />
        <EditFieldsForm fields={fields} onChange={patch} />
        {error && <div className="px-4 pb-2"><ErrorAlert message={error} /></div>}
        <ModalFooter>
          <CancelButton onClick={onClose} />
          <button type="button" onClick={save} disabled={busy}
            className="rounded bg-interactive-accent px-3 py-1 text-[11px] font-medium text-text-on-accent disabled:opacity-50">
            {busy ? 'Saving…' : 'Save'}
          </button>
        </ModalFooter>
      </ModalBox>
    </>
  );
}

// ─── DeleteMemoryConfirm ──────────────────────────────────────────────────────

export interface DeleteMemoryConfirmProps {
  id: string;
  label: string;
  projectRoot?: string | null;
  onDeleted: (id: string) => void;
  onClose: () => void;
}

function useDeleteConfirm(
  id: string,
  projectRoot: string | null | undefined,
  onDeleted: (id: string) => void,
): { busy: boolean; error: string | null; confirm: () => void } {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const confirm = useCallback(() => {
    const api = window.electronAPI?.memory;
    if (!api?.delete) return;
    setBusy(true);
    setError(null);
    void api.delete({ projectRoot: projectRoot ?? undefined, id })
      .then((res) => {
        setBusy(false);
        if (!res.success) { setError(res.error ?? 'Delete failed'); return; }
        onDeleted(id);
      });
  }, [id, projectRoot, onDeleted]);
  return { busy, error, confirm };
}

export function DeleteMemoryConfirm({
  id, label, projectRoot, onDeleted, onClose,
}: DeleteMemoryConfirmProps): React.ReactElement {
  const { busy, error, confirm } = useDeleteConfirm(id, projectRoot, onDeleted);
  useEscapeKey(onClose);
  return (
    <>
      <ModalBackdrop onClose={onClose} />
      <ModalBox>
        <ModalHeader title="Delete memory entry" onClose={onClose} />
        <div className="px-4 py-4 text-[12px] text-text-semantic-secondary">
          Delete{' '}
          <span className="font-medium text-text-semantic-primary">{label}</span>
          {'? This removes the file and its MEMORY.md index line.'}
        </div>
        {error && <div className="px-4 pb-2"><ErrorAlert message={error} /></div>}
        <ModalFooter>
          <CancelButton onClick={onClose} />
          <button type="button" onClick={confirm} disabled={busy}
            aria-label={`Confirm delete ${label}`}
            className="rounded bg-status-error px-3 py-1 text-[11px] font-medium text-text-on-accent disabled:opacity-50">
            {busy ? 'Deleting…' : 'Delete'}
          </button>
        </ModalFooter>
      </ModalBox>
    </>
  );
}
