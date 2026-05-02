/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DeleteMemoryConfirm, EditMemoryModal } from './ContextPreviewMemoryModals';

afterEach(() => cleanup());

// ─── EditMemoryModal ──────────────────────────────────────────────────────────

describe('EditMemoryModal', () => {
  it('renders entry id as read-only and description as editable', () => {
    render(
      <EditMemoryModal
        id="my_entry"
        initialDescription="old desc"
        initialType="user"
        initialContent="body"
        onSaved={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    const inputs = screen.getAllByRole('textbox') as HTMLInputElement[];
    const readOnly = inputs.find((i) => i.readOnly);
    expect(readOnly).toBeTruthy();
    const descInput = inputs.find((i) => !i.readOnly && i.value === 'old desc');
    expect(descInput).toBeTruthy();
  });

  it('calls onClose when Cancel is clicked', () => {
    const onClose = vi.fn();
    render(
      <EditMemoryModal
        id="x"
        initialDescription="d"
        initialType="user"
        initialContent="c"
        onSaved={vi.fn()}
        onClose={onClose}
      />,
    );
    fireEvent.click(screen.getByText('Cancel'));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('calls onClose when Escape is pressed', () => {
    const onClose = vi.fn();
    render(
      <EditMemoryModal
        id="x"
        initialDescription="d"
        initialType="user"
        initialContent="c"
        onSaved={vi.fn()}
        onClose={onClose}
      />,
    );
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('renders type select with correct initial value', () => {
    render(
      <EditMemoryModal
        id="x"
        initialDescription="d"
        initialType="feedback"
        initialContent="c"
        onSaved={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    const select = screen.getByRole('combobox') as HTMLSelectElement;
    expect(select.value).toBe('feedback');
  });

  it('calls memory.write and onSaved on Save click', async () => {
    const write = vi.fn().mockResolvedValue({ success: true, id: 'x' });
    Object.defineProperty(window, 'electronAPI', {
      value: { memory: { write } },
      configurable: true,
    });
    const onSaved = vi.fn();
    render(
      <EditMemoryModal
        id="x"
        initialDescription="d"
        initialType="user"
        initialContent="body"
        onSaved={onSaved}
        onClose={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText('Save'));
    await vi.waitFor(() => expect(onSaved).toHaveBeenCalledWith('x', 'd', 'user'));
  });

  it('shows error alert when write fails', async () => {
    const write = vi.fn().mockResolvedValue({ success: false, error: 'disk full' });
    Object.defineProperty(window, 'electronAPI', {
      value: { memory: { write } },
      configurable: true,
    });
    render(
      <EditMemoryModal
        id="x"
        initialDescription="d"
        initialType="user"
        initialContent="body"
        onSaved={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText('Save'));
    await vi.waitFor(() => expect(screen.getByRole('alert').textContent).toContain('disk full'));
  });
});

// ─── DeleteMemoryConfirm ──────────────────────────────────────────────────────

describe('DeleteMemoryConfirm', () => {
  it('renders entry label in confirmation text', () => {
    render(
      <DeleteMemoryConfirm
        id="my_entry"
        label="My Entry"
        onDeleted={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText('My Entry')).toBeTruthy();
  });

  it('calls onClose when Cancel is clicked', () => {
    const onClose = vi.fn();
    render(
      <DeleteMemoryConfirm id="x" label="X" onDeleted={vi.fn()} onClose={onClose} />,
    );
    fireEvent.click(screen.getByText('Cancel'));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('calls onClose when Escape is pressed', () => {
    const onClose = vi.fn();
    render(
      <DeleteMemoryConfirm id="x" label="X" onDeleted={vi.fn()} onClose={onClose} />,
    );
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('calls memory.delete and onDeleted on confirm', async () => {
    const del = vi.fn().mockResolvedValue({ success: true });
    Object.defineProperty(window, 'electronAPI', {
      value: { memory: { delete: del } },
      configurable: true,
    });
    const onDeleted = vi.fn();
    render(
      <DeleteMemoryConfirm id="y" label="Y" onDeleted={onDeleted} onClose={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Confirm delete Y/i }));
    await vi.waitFor(() => expect(onDeleted).toHaveBeenCalledWith('y'));
  });

  it('shows error alert when delete fails', async () => {
    const del = vi.fn().mockResolvedValue({ success: false, error: 'permission denied' });
    Object.defineProperty(window, 'electronAPI', {
      value: { memory: { delete: del } },
      configurable: true,
    });
    render(
      <DeleteMemoryConfirm id="y" label="Y" onDeleted={vi.fn()} onClose={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Confirm delete Y/i }));
    await vi.waitFor(() =>
      expect(screen.getByRole('alert').textContent).toContain('permission denied'),
    );
  });
});
