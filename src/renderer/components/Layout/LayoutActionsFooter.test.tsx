/**
 * @vitest-environment jsdom
 *
 * LayoutActionsFooter.test.tsx — Wave 28 Phase D smoke tests.
 *
 * Verifies the three action buttons call the expected methods on the
 * LayoutPresetResolver context and the "Save as…" flow prompts for a name.
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./layoutPresets/LayoutPresetResolver', () => ({
  useLayoutPreset: vi.fn(),
}));

import { LayoutActionsFooter } from './LayoutActionsFooter';
import { useLayoutPreset } from './layoutPresets/LayoutPresetResolver';

const mockUseLayoutPreset = vi.mocked(useLayoutPreset);

function makeContext(overrides: Partial<ReturnType<typeof useLayoutPreset>> = {}) {
  const undoLayout = vi.fn();
  const resetLayout = vi.fn();
  const promoteToGlobal = vi.fn();
  mockUseLayoutPreset.mockReturnValue({
    preset: { id: 'ide-primary', name: 'IDE', slots: {}, panelSizes: {}, visiblePanels: {} },
    slotTree: { kind: 'leaf', slotName: 'editorContent', component: { componentKey: 'editorContent' } },
    swapSlots: vi.fn(),
    splitSlot: vi.fn(),
    undoLayout,
    canUndo: true,
    resetLayout,
    promoteToGlobal,
    ...overrides,
  });
  return { undoLayout, resetLayout, promoteToGlobal };
}

beforeEach(() => { vi.clearAllMocks(); });
afterEach(() => { cleanup(); });

describe('LayoutActionsFooter', () => {
  it('renders Undo, Reset, and Save as buttons', () => {
    makeContext();
    render(<LayoutActionsFooter />);
    expect(screen.getByRole('button', { name: 'Undo' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Reset' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Save as/ })).toBeTruthy();
  });

  it('Undo button calls undoLayout when canUndo is true', () => {
    const { undoLayout } = makeContext({ canUndo: true });
    render(<LayoutActionsFooter />);
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(undoLayout).toHaveBeenCalledOnce();
  });

  it('Undo button is disabled when canUndo is false', () => {
    const { undoLayout } = makeContext({ canUndo: false });
    render(<LayoutActionsFooter />);
    const btn = screen.getByRole('button', { name: 'Undo' }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    fireEvent.click(btn);
    expect(undoLayout).not.toHaveBeenCalled();
  });

  it('Reset button calls resetLayout', () => {
    const { resetLayout } = makeContext();
    render(<LayoutActionsFooter />);
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
    expect(resetLayout).toHaveBeenCalledOnce();
  });

  it('Save as… opens an input and calls promoteToGlobal with trimmed name', () => {
    const { promoteToGlobal } = makeContext();
    render(<LayoutActionsFooter />);
    fireEvent.click(screen.getByRole('button', { name: /Save as/ }));
    const input = screen.getByPlaceholderText('Preset name') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '  My Layout  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(promoteToGlobal).toHaveBeenCalledWith('My Layout');
  });

  it('Save button is disabled when name is empty or whitespace', () => {
    const { promoteToGlobal } = makeContext();
    render(<LayoutActionsFooter />);
    fireEvent.click(screen.getByRole('button', { name: /Save as/ }));
    const saveBtn = screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement;
    expect(saveBtn.disabled).toBe(true);
    const input = screen.getByPlaceholderText('Preset name') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '   ' } });
    expect(saveBtn.disabled).toBe(true);
    fireEvent.click(saveBtn);
    expect(promoteToGlobal).not.toHaveBeenCalled();
  });

  it('Enter key in name input confirms promotion', () => {
    const { promoteToGlobal } = makeContext();
    render(<LayoutActionsFooter />);
    fireEvent.click(screen.getByRole('button', { name: /Save as/ }));
    const input = screen.getByPlaceholderText('Preset name');
    fireEvent.change(input, { target: { value: 'Quick' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(promoteToGlobal).toHaveBeenCalledWith('Quick');
  });

  it('Escape key in name input cancels promotion', () => {
    const { promoteToGlobal } = makeContext();
    render(<LayoutActionsFooter />);
    fireEvent.click(screen.getByRole('button', { name: /Save as/ }));
    const input = screen.getByPlaceholderText('Preset name');
    fireEvent.change(input, { target: { value: 'Quick' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(promoteToGlobal).not.toHaveBeenCalled();
    expect(screen.queryByPlaceholderText('Preset name')).toBeNull();
  });
});
