import { describe, expect, it, vi } from 'vitest';
import { finalizeDirtyCloseChoice } from './dirtyCloseFlow';

describe('dirtyCloseFlow', () => {
  it('aborts when the user cancels', async () => {
    const saveFile = vi.fn();
    const discardDraft = vi.fn();

    const result = await finalizeDirtyCloseChoice({
      choice: 'cancel',
      discardDraft,
      filePath: '/demo.txt',
      saveFile,
    });

    expect(result).toEqual({ outcome: 'abort', choice: 'cancel' });
    expect(saveFile).not.toHaveBeenCalled();
    expect(discardDraft).not.toHaveBeenCalled();
  });

  it('discards the draft and closes when discard is chosen', async () => {
    const saveFile = vi.fn();
    const discardDraft = vi.fn();

    const result = await finalizeDirtyCloseChoice({
      choice: 'discard',
      discardDraft,
      filePath: '/demo.txt',
      saveFile,
    });

    expect(result).toEqual({ outcome: 'close', choice: 'discard' });
    expect(discardDraft).toHaveBeenCalledWith('/demo.txt');
    expect(saveFile).not.toHaveBeenCalled();
  });

  it('closes after a successful save', async () => {
    const saveFile = vi.fn().mockResolvedValue({ success: true });
    const discardDraft = vi.fn();

    const result = await finalizeDirtyCloseChoice({
      choice: 'save',
      discardDraft,
      filePath: '/demo.txt',
      saveFile,
    });

    expect(result).toEqual({ outcome: 'close', choice: 'save' });
    expect(saveFile).toHaveBeenCalledWith('/demo.txt');
    expect(discardDraft).not.toHaveBeenCalled();
  });

  it('returns the save error when saving fails', async () => {
    const saveFile = vi.fn().mockResolvedValue({ success: false, error: 'Disk full' });
    const discardDraft = vi.fn();

    const result = await finalizeDirtyCloseChoice({
      choice: 'save',
      discardDraft,
      filePath: '/demo.txt',
      saveFile,
    });

    expect(result).toEqual({ outcome: 'abort', choice: 'save', error: 'Disk full' });
    expect(discardDraft).not.toHaveBeenCalled();
  });
});
