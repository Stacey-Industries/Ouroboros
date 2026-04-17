/**
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DiffReviewHeaderActions } from './DiffReviewHeaderActions';
import type { ReviewFile } from './types';

function makeFile(
  path: string,
  decision: 'pending' | 'accepted' | 'rejected' = 'pending',
): ReviewFile {
  return {
    filePath: path,
    relativePath: path,
    status: 'modified',
    hunks: [
      {
        id: 'h1',
        header: '@@ -1,3 +1,5 @@',
        oldStart: 1,
        oldCount: 3,
        newStart: 1,
        newCount: 5,
        lines: ['+added'],
        rawPatch: '',
        decision,
      },
    ],
  };
}

function makeProps(
  overrides: Partial<React.ComponentProps<typeof DiffReviewHeaderActions>> = {},
) {
  return {
    allDecided: false,
    canRollback: false,
    enhancedEnabled: true,
    files: [],
    onAcceptAll: vi.fn(),
    onClose: vi.fn(),
    onRejectAll: vi.fn(),
    onRollback: vi.fn(),
    ...overrides,
  };
}

afterEach(cleanup);

describe('DiffReviewHeaderActions — rollback', () => {
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
});

describe('DiffReviewHeaderActions — accept/reject all', () => {
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

describe('DiffReviewHeaderActions — export button', () => {
  it('export button rendered when enhancedEnabled is true', () => {
    render(<DiffReviewHeaderActions {...makeProps({ enhancedEnabled: true })} />);
    expect(screen.getByRole('button', { name: /export/i })).toBeTruthy();
  });

  it('export button hidden when enhancedEnabled is false', () => {
    render(<DiffReviewHeaderActions {...makeProps({ enhancedEnabled: false })} />);
    expect(screen.queryByRole('button', { name: /export/i })).toBeNull();
  });

  it('export button disabled when no decisions have been made', () => {
    const files = [makeFile('src/a.ts', 'pending')];
    render(<DiffReviewHeaderActions {...makeProps({ files })} />);
    const btn = screen.getByRole('button', { name: /export/i }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it('export button enabled when at least one hunk is accepted', () => {
    const files = [makeFile('src/a.ts', 'accepted')];
    render(<DiffReviewHeaderActions {...makeProps({ files })} />);
    const btn = screen.getByRole('button', { name: /export/i }) as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
  });

  it('export button enabled when at least one hunk is rejected', () => {
    const files = [makeFile('src/a.ts', 'rejected')];
    render(<DiffReviewHeaderActions {...makeProps({ files })} />);
    const btn = screen.getByRole('button', { name: /export/i }) as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
  });

  it('clicking export opens popover with copy and save options', () => {
    const files = [makeFile('src/a.ts', 'accepted')];
    render(<DiffReviewHeaderActions {...makeProps({ files })} />);
    fireEvent.click(screen.getByRole('button', { name: /export/i }));
    expect(screen.getByText(/copy to clipboard/i)).toBeTruthy();
    expect(screen.getByText(/save to file/i)).toBeTruthy();
  });

  it('copy to clipboard calls navigator.clipboard.writeText with markdown', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      writable: true,
      configurable: true,
    });
    const files = [makeFile('src/a.ts', 'accepted')];
    render(<DiffReviewHeaderActions {...makeProps({ files })} />);
    fireEvent.click(screen.getByRole('button', { name: /export/i }));
    fireEvent.click(screen.getByText(/copy to clipboard/i));
    expect(writeText).toHaveBeenCalledOnce();
    const [arg] = writeText.mock.calls[0] as [string];
    expect(arg).toContain('## Summary');
    expect(arg).toContain('src/a.ts');
  });

  it('save to file calls window.electronAPI.app.saveFileDialog', () => {
    const saveFileDialog = vi.fn().mockResolvedValue({ success: true });
    Object.defineProperty(window, 'electronAPI', {
      value: { app: { saveFileDialog } },
      writable: true,
      configurable: true,
    });
    const files = [makeFile('src/a.ts', 'accepted')];
    render(<DiffReviewHeaderActions {...makeProps({ files })} />);
    fireEvent.click(screen.getByRole('button', { name: /export/i }));
    fireEvent.click(screen.getByText(/save to file/i));
    expect(saveFileDialog).toHaveBeenCalledOnce();
    const [name, content] = saveFileDialog.mock.calls[0] as [string, string];
    expect(name).toBe('pr-description.md');
    expect(content).toContain('## Summary');
  });
});

describe('DiffReviewHeaderActions — export ipc handler', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'electronAPI', {
      value: { app: { saveFileDialog: vi.fn().mockResolvedValue({ success: false, cancelled: true }) } },
      writable: true,
      configurable: true,
    });
  });

  it('popover closes after copy', () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      writable: true,
      configurable: true,
    });
    const files = [makeFile('src/z.ts', 'accepted')];
    render(<DiffReviewHeaderActions {...makeProps({ files })} />);
    fireEvent.click(screen.getByRole('button', { name: /export/i }));
    expect(screen.getByText(/copy to clipboard/i)).toBeTruthy();
    fireEvent.click(screen.getByText(/copy to clipboard/i));
    expect(screen.queryByText(/copy to clipboard/i)).toBeNull();
  });
});
