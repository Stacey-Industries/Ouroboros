/**
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DiffReviewHeaderActions } from './DiffReviewHeaderActions';

function makeProps(overrides: Partial<React.ComponentProps<typeof DiffReviewHeaderActions>> = {}) {
  return {
    allDecided: false,
    canRollback: false,
    enhancedEnabled: true,
    onAcceptAll: vi.fn(),
    onClose: vi.fn(),
    onRejectAll: vi.fn(),
    onRollback: vi.fn(),
    ...overrides,
  };
}

afterEach(cleanup);

describe('DiffReviewHeaderActions', () => {
  it('rollback button is disabled when canRollback is false', () => {
    render(<DiffReviewHeaderActions {...makeProps({ canRollback: false })} />);
    const btn = screen.getByRole('button', { name: /undo last accept/i }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it('rollback button calls onRollback when enabled and clicked', () => {
    const onRollback = vi.fn();
    render(<DiffReviewHeaderActions {...makeProps({ canRollback: true, onRollback })} />);
    const btn = screen.getByRole('button', { name: /undo last accept/i });
    fireEvent.click(btn);
    expect(onRollback).toHaveBeenCalledOnce();
  });

  it('rollback button not rendered when enhancedEnabled is false', () => {
    render(<DiffReviewHeaderActions {...makeProps({ enhancedEnabled: false })} />);
    expect(screen.queryByRole('button', { name: /undo last accept/i })).toBeNull();
  });

  it('accept all and reject all hidden when allDecided is true', () => {
    render(<DiffReviewHeaderActions {...makeProps({ allDecided: true })} />);
    expect(screen.queryByRole('button', { name: /accept all/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /reject all/i })).toBeNull();
  });

  it('accept all and reject all shown when allDecided is false', () => {
    render(<DiffReviewHeaderActions {...makeProps({ allDecided: false })} />);
    expect(screen.getByRole('button', { name: /accept all/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /reject all/i })).toBeTruthy();
  });

  it('close button label is Done when allDecided', () => {
    render(<DiffReviewHeaderActions {...makeProps({ allDecided: true })} />);
    expect(screen.getByRole('button', { name: /done/i })).toBeTruthy();
  });

  it('close button calls onClose', () => {
    const onClose = vi.fn();
    render(<DiffReviewHeaderActions {...makeProps({ onClose })} />);
    fireEvent.click(screen.getByRole('button', { name: /close/i }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
