/**
 * dirtyCloseFlow.ts — Stub module for dirty close flow logic.
 */

export type DirtyCloseChoice = 'save' | 'discard' | 'cancel';

interface DirtyCloseResolution {
  /** 'close' — proceed to close the tab; 'abort' — keep the tab open */
  outcome: 'close' | 'abort';
  choice: DirtyCloseChoice;
  error?: string;
}

interface FinalizeDirtyCloseArgs {
  choice: DirtyCloseChoice;
  discardDraft: (filePath: string) => void;
  filePath: string;
  saveFile: (filePath: string) => Promise<{ success: boolean; error?: string }>;
}

export async function finalizeDirtyCloseChoice(args: FinalizeDirtyCloseArgs): Promise<DirtyCloseResolution> {
  const { choice, discardDraft, filePath, saveFile } = args;

  if (choice === 'cancel') {
    return { outcome: 'abort', choice };
  }

  if (choice === 'discard') {
    discardDraft(filePath);
    return { outcome: 'close', choice };
  }

  // choice === 'save'
  try {
    const result = await saveFile(filePath);
    if (result.success) {
      return { outcome: 'close', choice };
    }
    return { outcome: 'abort', choice, error: result.error ?? 'Failed to save file' };
  } catch (err) {
    return {
      outcome: 'abort',
      choice,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
